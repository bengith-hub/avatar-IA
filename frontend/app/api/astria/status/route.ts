import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAstriaPrompt } from "@/lib/astria-api";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const promptId = req.nextUrl.searchParams.get("prompt_id");
  if (!promptId) {
    return NextResponse.json({ error: "prompt_id requis" }, { status: 400 });
  }

  try {
    const result = await getAstriaPrompt(Number(promptId));

    // Normalize: if images exist but status is missing, mark as processed
    const normalized = {
      ...result,
      status: result.status || (result.images?.length > 0 ? "processed" : "queued"),
    };

    return NextResponse.json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
