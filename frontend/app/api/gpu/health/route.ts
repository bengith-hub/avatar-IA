import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { workerHealth } from "@/lib/gpu-api";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const data = await workerHealth();
    return NextResponse.json({ connected: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ connected: false, error: message }, { status: 200 });
  }
}
