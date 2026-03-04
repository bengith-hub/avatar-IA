import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadVideo } from "@/lib/gpu-api";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const jobId = req.nextUrl.searchParams.get("job_id");
  if (!jobId) {
    return NextResponse.json({ error: "job_id requis" }, { status: 400 });
  }

  try {
    const workerRes = await downloadVideo(jobId);
    const blob = await workerRes.blob();

    return new NextResponse(blob, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="avatar-${jobId}.mp4"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
