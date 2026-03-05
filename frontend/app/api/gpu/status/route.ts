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
    const isUnavailable =
      message.includes("fetch failed") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ETIMEDOUT") ||
      message.includes("UND_ERR") ||
      message.includes("is not set") ||
      message.includes("VM GPU") ||
      message.includes("tunnel") ||
      message.includes("Impossible de joindre") ||
      message.includes("failed (404)") ||
      message.includes("failed (502)") ||
      message.includes("failed (503)");
    if (isUnavailable) {
      return NextResponse.json(
        { error: "VM GPU éteinte — démarrez-la d'abord" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
