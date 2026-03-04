import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listJobs } from "@/lib/gpu-api";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await listJobs();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    const isUnavailable =
      message.includes("fetch failed") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ETIMEDOUT") ||
      message.includes("UND_ERR") ||
      message.includes("is not set") ||
      message.includes("failed (404)") ||
      message.includes("failed (502)") ||
      message.includes("failed (503)");
    if (isUnavailable) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
