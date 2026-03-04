import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateAstriaImages } from "@/lib/astria-api";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { text, num_images } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Texte requis" }, { status: 400 });
    }

    const result = await generateAstriaImages(text, num_images || 4);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
