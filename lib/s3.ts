import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

// Lazy: avoid constructing the client at import time (build-time page-data
// collection would throw "Region is missing" when env vars are absent).
export function getS3Client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: process.env.S3_HOST,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_KEY!,
        secretAccessKey: process.env.S3_TOKEN!,
      },
      forcePathStyle: true,
    });
  }
  return _client;
}

export const s3Bucket = () => process.env.S3_NAME!;

export function s3Key(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

export function getPublicUrl(key: string): string {
  return `${process.env.S3_HOST}/${process.env.S3_NAME}/${key}`;
}
