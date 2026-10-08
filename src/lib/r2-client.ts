import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface R2Config {
  accountId: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucketName: string;
  publicUrl: string; // e.g., https://assets.your-domain.com
}

const config: R2Config = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
  accessKeySecret: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "",
  bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || "",
  publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL || "",
};

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.accessKeySecret,
  },
});

export async function generateUploadSignedUrl(
  key: string,
  contentType: string,
  // F-33: shorter upload TTL. 1h was the prior default; in practice an
  // upload completes in seconds, and a stolen signed URL with a 1h
  // window is far more useful to an attacker than one with a 15min
  // window. Callers can still pass a longer TTL explicitly for big
  // backup uploads.
  expiresIn: number = 900 // 15 min default
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function generateDownloadSignedUrl(
  key: string,
  expiresIn: number = 300
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export function getPublicUrl(key: string): string {
  return `${config.publicUrl}/${key}`;
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });
  await s3Client.send(command);
}

export async function getObjectMetadata(key: string): Promise<{
  contentLength: number;
  contentType: string;
}> {
  const command = new HeadObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });
  const result = await s3Client.send(command);
  return {
    contentLength: result.ContentLength ?? 0,
    contentType: result.ContentType ?? "",
  };
}

export { s3Client };
