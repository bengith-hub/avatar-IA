import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getVideoStream } from "@/lib/r2";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key requis" }, { status: 400 });
  }

  try {
    const stream = await getVideoStream(key);
    if (!stream) {
      return NextResponse.json({ error: "Vidéo non trouvée" }, { status: 404 });
    }

    // @ts-expect-error — S3 Body is a Readable stream
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
