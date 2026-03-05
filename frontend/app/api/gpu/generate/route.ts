import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateVideo, fetchWorkerVoiceSampleBase64 } from "@/lib/gpu-api";

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

    // Ensure a voice sample is available for TTS.
    // Priority: 1) already in body, 2) from worker VM, 3) from R2
    if (!body.voice_sample_base64) {
      console.log("[gpu/generate] No voice in request body, trying worker...");
      const workerVoice = await fetchWorkerVoiceSampleBase64();
      if (workerVoice) {
        console.log("[gpu/generate] Voice found on worker:", workerVoice.filename);
        body.voice_sample_base64 = workerVoice.base64;
        body.voice_sample_filename = workerVoice.filename;
      } else {
        console.log("[gpu/generate] No voice on worker, trying R2...");
        const r2Voice = await fetchR2VoiceSampleBase64Safe();
        if (r2Voice) {
          console.log("[gpu/generate] Voice found on R2:", r2Voice.filename);
          body.voice_sample_base64 = r2Voice.base64;
          body.voice_sample_filename = r2Voice.filename;
        } else {
          console.error("[gpu/generate] No voice sample found anywhere (worker, R2)");
          return NextResponse.json(
            {
              error:
                "Aucun échantillon vocal trouvé. Veuillez uploader votre voix dans la page Avatars avant de générer.",
            },
            { status: 400 }
          );
        }
      }
    }

    const result = await generateVideo(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    console.error("[gpu/generate] Error:", message);
    const isConnError =
      message.includes("Connexion refusée") ||
      message.includes("tunnel") ||
      message.includes("URL introuvable") ||
      message.includes("Timeout") ||
      message.includes("fetch failed") ||
      message.includes("ECONNREFUSED");
    return NextResponse.json(
      { error: message },
      { status: isConnError ? 503 : 500 }
    );
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
  if (!isR2Configured()) {
    console.log("[gpu/generate] R2 not configured, skipping voice fallback");
    return null;
  }

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
    if (!obj?.Key) {
      console.log("[gpu/generate] No voice sample found on R2 (prefix: voice-samples/)");
      return null;
    }

    console.log("[gpu/generate] Found voice sample on R2:", obj.Key);
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
  } catch (err) {
    console.error("[gpu/generate] R2 voice fallback error:", err instanceof Error ? err.message : err);
    return null;
  }
}
