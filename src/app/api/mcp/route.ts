import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { findLiveKey } from "@/lib/keys";
import { readDailyUsage } from "@/lib/quota";
import { scenePlanSchema, type ScenePlan } from "@/lib/scene-plan";
import { synthesize } from "@/lib/tts";
import { renderVideo } from "@/lib/render";
import { quoteCredits, tryDeduct, refund, readBalance } from "@/lib/credits";
import {
  TOOL_DEFINITIONS,
  findTool,
  jsonSchemaFor,
  type ToolName,
} from "@/lib/mcp/tools";

const TOPUP_URL =
  (process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "") + "/dashboard#credits";

export const runtime = "nodejs";
// Async response returns in <1s — but keep the ceiling generous for the
// synth+render work that finishes AFTER the response is flushed. Node keeps
// the promise alive; this just tells Next not to kill the worker early.
export const maxDuration = 600;

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "video-render-mcp",
  version: "0.2.0",
};

/**
 * Standard JSON-RPC 2.0 endpoint that speaks MCP.
 *
 * Auth: Bearer <apiKey> in the Authorization header. Sign up at
 * https://video-render.regiq.in to get one.
 *
 * Quota: 20 successful renders per user per UTC day. `tools/list` and
 * `initialize` are free.
 */
export async function POST(req: Request) {
  const rpc = await req.json().catch(() => null);
  if (!isValidRpc(rpc)) return jsonRpcError(null, -32700, "Parse error");

  // initialize is the one method that doesn't require auth — it's how the
  // client discovers the server and MUST work before Claude Desktop bothers
  // with the token.
  if (rpc.method === "initialize") {
    return jsonRpcOk(rpc.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  const auth = req.headers.get("authorization") || "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const key = raw ? await findLiveKey(raw) : null;
  if (!key) return jsonRpcError(rpc.id, -32001, "Unauthorized — set Authorization: Bearer <key>");
  const userId = key.userId;

  switch (rpc.method) {
    case "tools/list":
      return jsonRpcOk(rpc.id, {
        tools: TOOL_DEFINITIONS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: jsonSchemaFor(t.name),
        })),
      });

    case "tools/call": {
      const { name, arguments: args } = (rpc.params ?? {}) as {
        name?: string;
        arguments?: unknown;
      };
      if (!name) return jsonRpcError(rpc.id, -32602, "Missing tool name");
      const tool = findTool(name);
      if (!tool) return jsonRpcError(rpc.id, -32601, `Unknown tool: ${name}`);

      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) {
        return jsonRpcError(
          rpc.id,
          -32602,
          "Invalid arguments: " + JSON.stringify(parsed.error.flatten())
        );
      }

      try {
        const result = await runTool(name as ToolName, parsed.data, userId);
        return jsonRpcOk(rpc.id, result);
      } catch (err) {
        const message = (err as Error).message || String(err);
        return jsonRpcOk(rpc.id, {
          isError: true,
          content: [{ type: "text", text: message }],
        });
      }
    }

    case "ping":
      return jsonRpcOk(rpc.id, {});

    default:
      return jsonRpcError(rpc.id, -32601, `Method not found: ${rpc.method}`);
  }
}

async function runTool(name: ToolName, args: ScenePlan, userId: string) {
  switch (name) {
    case "plan_video_scenes":
      // Pure schema tool: echo the plan back so the model can show + edit it.
      return {
        content: [
          {
            type: "text",
            text:
              "Plan drafted. Review with the user, then call render_video with the same object.\n\n" +
              JSON.stringify(args, null, 2),
          },
        ],
        structuredContent: { plan: args },
      };

    case "render_video":
      return startRender(args, userId);
  }
}

/**
 * Enqueue an async render. Deducts credits up front, creates a
 * RenderJob(status="pending"), kicks off the actual work in the background,
 * and returns immediately with a jobId the caller polls.
 *
 * This shape sidesteps the Cloudflare Tunnel 100s hard cap on HTTP responses
 * — full renders can take 3–5 minutes, but the RPC response lands in <1s.
 */
async function startRender(plan: ScenePlan, userId: string) {
  // Legacy quota (20/day) is still tracked for analytics.
  await readDailyUsage(userId);

  const upfront = quoteCredits(plan);
  const balanceAfter = await tryDeduct(userId, upfront.totalCredits, "render");
  if (balanceAfter === null) {
    const currentBalance = await readBalance(userId);
    throw new Error(
      `Insufficient credits: this render needs ${upfront.totalCredits} credits, you have ${currentBalance}. Top up at ${TOPUP_URL}`
    );
  }

  const job = await prisma.renderJob.create({
    data: { userId, status: "pending" },
  });

  const statusUrl = publicStatusUrl(job.id);
  const videoUrl = publicVideoUrl(job.id);

  // Fire-and-forget: Node keeps the promise alive after we return the RPC
  // response. Any error is logged + reflected on the RenderJob row so the
  // client sees it on the next poll.
  void runRenderJob(job.id, plan, userId, upfront.totalCredits, balanceAfter).catch(
    (err) => console.error("[render] background job", job.id, "crashed:", err)
  );

  return {
    content: [
      {
        type: "text",
        text:
          `Render queued as job ${job.id}. Poll ${statusUrl} until status=success, then fetch ${videoUrl}. ` +
          `Estimate ${upfront.totalCredits} credits (${balanceAfter} left after upfront deduction — refunded on failure).`,
      },
    ],
    structuredContent: {
      jobId: job.id,
      status: "pending",
      statusUrl,
      videoUrl,
      creditsQuoted: upfront.totalCredits,
      creditsRemaining: balanceAfter,
      topupUrl: TOPUP_URL,
    },
  };
}

async function runRenderJob(
  jobId: string,
  plan: ScenePlan,
  userId: string,
  upfrontCredits: number,
  balanceAfterDeduct: number
): Promise<void> {
  await prisma.renderJob
    .update({ where: { id: jobId }, data: { status: "rendering" } })
    .catch(() => undefined);

  try {
    const audio = await synthesize(plan.script, plan.voice);
    const dataDir = process.env.RENDER_DATA_DIR || path.join(process.cwd(), "data");
    const outputDir = path.join(dataDir, "renders", userId);
    const result = await renderVideo({
      plan,
      narrationBytes: audio.bytes,
      narrationDurationSec: audio.durationSec,
      words: audio.words,
      outputDir,
    });

    // Reconcile: if the actual render was shorter than the target, refund the
    // difference. If it was LONGER we eat the delta — cheaper than surprising
    // the user with a second deduction.
    const actual = quoteCredits(plan, result.durationSec);
    if (actual.totalCredits < upfrontCredits) {
      await refund(userId, upfrontCredits - actual.totalCredits, jobId);
    }

    const fileName = path.basename(result.filePath);
    await prisma.renderJob.update({
      where: { id: jobId },
      data: {
        status: "success",
        durationSec: result.durationSec,
        sizeBytes: result.bytes.length,
        fileName,
      },
    });

    const renamedPath = path.join(outputDir, `${jobId}.mp4`);
    await fs.rename(result.filePath, renamedPath).catch(() => undefined);
  } catch (err) {
    // Render failed — refund every credit we deducted up front.
    await refund(userId, upfrontCredits, jobId);
    await prisma.renderJob
      .update({
        where: { id: jobId },
        data: { status: "failed", errorMessage: (err as Error).message.slice(0, 500) },
      })
      .catch(() => undefined);
  }
  // balanceAfterDeduct is captured for observability but not persisted here —
  // the CreditTransaction table has the authoritative ledger.
  void balanceAfterDeduct;
}

function publicVideoUrl(jobId: string): string {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
  return `${base}/api/renders/${encodeURIComponent(jobId)}.mp4`;
}

function publicStatusUrl(jobId: string): string {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
  return `${base}/api/jobs/${encodeURIComponent(jobId)}`;
}

// ---------- JSON-RPC helpers ----------

interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

function isValidRpc(x: unknown): x is RpcRequest {
  if (!x || typeof x !== "object") return false;
  const r = x as RpcRequest;
  return r.jsonrpc === "2.0" && typeof r.method === "string";
}

function jsonRpcOk(id: RpcRequest["id"] | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonRpcError(
  id: RpcRequest["id"] | undefined | null,
  code: number,
  message: string
) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status: code === -32001 ? 401 : 200 }
  );
}

// Silence unused-imports lint — z is re-exported for other files' benefit
void z;
