import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY;
  const secretKey = process.env.R2_SECRET_KEY;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error("R2 credentials not configured");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
}

function bucket(): string {
  return process.env.R2_BUCKET ?? "avatar-videos";
}

export async function uploadVideo(
  key: string,
  body: Buffer | Uint8Array,
  contentType = "video/mp4"
): Promise<string> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

export async function getVideoUrl(key: string): Promise<string> {
  // R2 public URL (if public access is enabled on the bucket)
  const accountId = process.env.R2_ACCOUNT_ID;
  return `https://${bucket()}.${accountId}.r2.dev/${key}`;
}

export async function getVideoStream(key: string) {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
    })
  );
  return response.Body;
}

export async function listVideos(prefix = "videos/") {
  const client = getR2Client();
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket(),
      Prefix: prefix,
    })
  );
  return (response.Contents ?? []).map((obj) => ({
    key: obj.Key ?? "",
    size: obj.Size ?? 0,
    lastModified: obj.LastModified ?? new Date(),
  }));
}

export async function deleteVideo(key: string) {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket(),
      Key: key,
    })
  );
}
