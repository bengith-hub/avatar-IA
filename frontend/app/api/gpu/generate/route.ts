import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateVideo } from "@/lib/gpu-api";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();

    // If avatar photo is stored on R2, fetch and embed as base64
    if (typeof body.avatar_id === "string" && body.avatar_id.startsWith("r2-")) {
      try {
        const avatarData = await fetchR2AvatarBase64(body.avatar_id);
        body.avatar_photo_base64 = avatarData.base64;
        body.avatar_photo_filename = avatarData.filename;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur avatar R2";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // Voice samples are now stored directly on the worker VM (via /voice-samples).
    // The worker's TTS engine will find them in its voice directory automatically.
    // Only embed from R2 as a last-resort fallback.
    if (!body.voice_sample_base64) {
      const voiceSample = await fetchR2VoiceSampleBase64Safe();
      if (voiceSample) {
        body.voice_sample_base64 = voiceSample.base64;
        body.voice_sample_filename = voiceSample.filename;
      }
    }

    const result = await generateVideo(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    console.error("[gpu/generate] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// --- R2 helpers (optional fallback, only used if R2 is configured) ---

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY &&
    process.env.R2_SECRET_KEY
  );
}

async function fetchR2AvatarBase64(avatarId: string): Promise<{
  base64: string;
  filename: string;
}> {
  if (!isR2Configured()) {
    throw new Error("R2 non configuré — impossible de récupérer l'avatar");
  }

  const { S3Client, GetObjectCommand, ListObjectsV2Command } = await import(
    "@aws-sdk/client-s3"
  );

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  });

  const bucket = process.env.R2_BUCKET ?? "avatar-videos";

  const listRes = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: `avatars/${avatarId}` })
  );

  const obj = listRes.Contents?.find((o) => o.Key && !o.Key.endsWith("/"));
  if (!obj?.Key) {
    throw new Error(`Avatar '${avatarId}' introuvable sur R2`);
  }

  const getRes = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: obj.Key })
  );
  if (!getRes.Body) {
    throw new Error("Fichier avatar vide sur R2");
  }

  const bytes = await getRes.Body.transformToByteArray();
  const ext = obj.Key.split(".").pop() ?? "png";

  return {
    base64: Buffer.from(bytes).toString("base64"),
    filename: `${avatarId}.${ext}`,
  };
}

async function fetchR2VoiceSampleBase64Safe(): Promise<{
  base64: string;
  filename: string;
} | null> {
  if (!isR2Configured()) return null;

  try {
    const { S3Client, GetObjectCommand, ListObjectsV2Command } = await import(
      "@aws-sdk/client-s3"
    );

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY!,
        secretAccessKey: process.env.R2_SECRET_KEY!,
      },
    });

    const bucket = process.env.R2_BUCKET ?? "avatar-videos";

    const listRes = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: "voice-samples/" })
    );

    const obj = listRes.Contents?.find((o) => o.Key && !o.Key.endsWith("/"));
    if (!obj?.Key) return null;

    const getRes = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: obj.Key })
    );
    if (!getRes.Body) return null;

    const bytes = await getRes.Body.transformToByteArray();
    const filename = obj.Key.replace("voice-samples/", "");

    return {
      base64: Buffer.from(bytes).toString("base64"),
      filename,
    };
  } catch {
    return null;
  }
}
