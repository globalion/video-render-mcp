import { prisma } from "@/lib/db";
import { findLiveKey } from "@/lib/keys";

/**
 * Poll a render job. Owned by the user whose API key is presented — cross-user
 * reads are 404 (not 403) so we don't leak job-id existence.
 *
 * Returns:
 *   status: "pending" | "rendering" | "success" | "failed"
 *   videoUrl: present iff status="success" (direct https link, valid 7 days)
 *   error:    present iff status="failed"
 *   durationSec / sizeBytes: present iff status="success"
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = req.headers.get("authorization") || "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const key = raw ? await findLiveKey(raw) : null;
  if (!key) {
    return jsonResponse(
      { error: "Unauthorized — set Authorization: Bearer <key>" },
      401
    );
  }

  const { id } = await params;

  const job = await prisma.renderJob.findFirst({
    where: { id, userId: key.userId },
    select: {
      id: true,
      status: true,
      durationSec: true,
      sizeBytes: true,
      fileName: true,
      errorMessage: true,
      createdAt: true,
    },
  });
  if (!job) return jsonResponse({ error: "Not found" }, 404);

  const body: Record<string, unknown> = {
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
  };

  if (job.status === "success" && job.fileName) {
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
    body.videoUrl = `${base}/api/renders/${encodeURIComponent(job.id)}.mp4`;
    body.durationSec = job.durationSec ?? undefined;
    body.sizeBytes = job.sizeBytes ?? undefined;
  } else if (job.status === "failed") {
    body.error = job.errorMessage || "Render failed";
  }

  return jsonResponse(body, 200);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Poll frequently; never let a CDN cache in-flight state.
      "Cache-Control": "no-store",
    },
  });
}
