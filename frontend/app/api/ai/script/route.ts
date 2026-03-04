import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateScript } from "@/lib/anthropic-api";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const prompt = body.prompt;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt requis" }, { status: 400 });
    }

    const script = await generateScript(prompt);
    return NextResponse.json({ script });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
