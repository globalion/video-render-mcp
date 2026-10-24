import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";

/**
 * Public download endpoint. URLs are unguessable (cuid), and we cap the
 * 7-day retention client-side by refusing to serve older jobs — the actual
 * cleanup is done by the janitor cron.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Strip .mp4 suffix if present (we mint URLs as `/api/renders/<id>.mp4`)
  const jobId = id.replace(/\.mp4$/i, "");

  const job = await prisma.renderJob.findFirst({
    where: { id: jobId, status: "success" },
    select: { userId: true, fileName: true, createdAt: true },
  });
  if (!job || !job.fileName) return new Response("Not found", { status: 404 });

  const ageDays =
    (Date.now() - job.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 7) return new Response("Expired", { status: 410 });

  const dataDir = process.env.RENDER_DATA_DIR || path.join(process.cwd(), "data");
  const filePath = path.join(dataDir, "renders", job.userId, `${jobId}.mp4`);

  try {
    const bytes = await fs.readFile(filePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=604800, immutable", "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
