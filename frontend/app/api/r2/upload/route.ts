import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadVideo } from "@/lib/gpu-api";
import { uploadVideo } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const jobId = body.job_id;

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "job_id requis" }, { status: 400 });
    }

    // Download video from worker
    const workerRes = await downloadVideo(jobId);
    const arrayBuffer = await workerRes.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to R2
    const key = `videos/${jobId}/avatar-${jobId}.mp4`;
    await uploadVideo(key, buffer);

    return NextResponse.json({ key, url: `/api/r2/stream?key=${encodeURIComponent(key)}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
