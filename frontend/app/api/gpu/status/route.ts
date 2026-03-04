import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getJobStatus } from "@/lib/gpu-api";

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
    const result = await getJobStatus(jobId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
