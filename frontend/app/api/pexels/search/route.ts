import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchPhotos, searchVideos } from "@/lib/pexels-api";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const query = req.nextUrl.searchParams.get("query");
  const type = req.nextUrl.searchParams.get("type") ?? "photos";

  if (!query) {
    return NextResponse.json({ error: "query requis" }, { status: 400 });
  }

  try {
    const result = type === "videos"
      ? await searchVideos(query)
      : await searchPhotos(query);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
