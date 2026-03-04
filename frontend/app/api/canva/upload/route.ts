import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadVideo } from "@/lib/gpu-api";
import { uploadAsset, createDesign } from "@/lib/canva-api";

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
    // Upload to Canva
    const { asset_id } = await uploadAsset(arrayBuffer, `avatar-${jobId}.mp4`);

    // Create design
    const { design_url } = await createDesign(asset_id);

    return NextResponse.json({ asset_id, design_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
