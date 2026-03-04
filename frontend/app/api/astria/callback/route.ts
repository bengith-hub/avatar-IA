import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Astria sends a callback when image generation is done.
  // For now we just acknowledge it — the frontend polls /api/astria/status.
  const body = await req.json();
  console.log("Astria callback received:", body?.id);
  return NextResponse.json({ ok: true });
}
