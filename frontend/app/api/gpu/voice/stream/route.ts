import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveWorkerUrl } from "@/lib/gpu-api";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let workerUrl: string;
  try {
    workerUrl = await resolveWorkerUrl();
  } catch {
    return NextResponse.json({ error: "Worker GPU non joignable" }, { status: 503 });
  }

  try {
    const res = await fetch(
      `${workerUrl}/voice-samples/${encodeURIComponent(name)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}`,
          "ngrok-skip-browser-warning": "true",
          "User-Agent": "AvatarIA-Worker/1.0",
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fichier introuvable (${res.status})` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") ?? "audio/wav";
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre la VM GPU" },
      { status: 502 }
    );
  }
}
