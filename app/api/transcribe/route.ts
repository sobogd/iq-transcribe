import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { prisma } from "@/lib/prisma";
import { getS3Client, s3Bucket, s3Key, getPublicUrl } from "@/lib/s3";
import { resolveOwner, isAllowed } from "@/lib/auth";
import { extractAudio } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const owner = resolveOwner(req);
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!req.body) return NextResponse.json({ error: "no body" }, { status: 400 });

  // Filename + type come from headers; the body is the raw file, streamed to disk
  // so the (potentially huge) video never sits in memory.
  const fileName = decodeURIComponent(req.headers.get("x-file-name") || "") || `upload-${Date.now()}.mp4`;
  const mimeType = req.headers.get("content-type") || "video/mp4";
  const sizeBytes = Number(req.headers.get("content-length") || 0) || null;
  const ext = fileName.includes(".") ? fileName.split(".").pop()! : "mp4";

  const dir = await mkdtemp(join(tmpdir(), "transcribe-"));
  const inPath = join(dir, `input.${ext}`);
  const outPath = join(dir, "audio.mp3");

  try {
    // 1) Stream upload → disk (no RAM buffer of the video).
    await pipeline(
      Readable.fromWeb(req.body as unknown as NodeWebReadableStream<Uint8Array>),
      createWriteStream(inPath),
    );

    // 2) Extract audio (mono 16 kHz MP3) from disk; read the small result.
    await extractAudio(inPath, outPath);
    await rm(inPath, { force: true }).catch(() => {}); // free disk early
    const audioBuf = await readFile(outPath);

    // 3) Upload the extracted audio to S3 (public-read so the player can stream it).
    const now = new Date();
    const key = s3Key("audio", String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), `${Date.now()}-${ext}.mp3`);
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
        Body: audioBuf,
        ContentType: "audio/mpeg",
        ACL: "public-read",
      }),
    );
    const audioUrl = getPublicUrl(key);

    // 4) Save the row as "ready": audio extracted + stored, transcription pending.
    //    The user triggers transcription separately via the transcribe endpoint.
    const row = await prisma.transcription.create({
      data: {
        ownerKey: owner,
        title: fileName,
        fileName,
        mimeType,
        sizeBytes,
        audioUrl,
        status: "ready",
      },
    });
    return NextResponse.json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
