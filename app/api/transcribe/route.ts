import { GoogleGenAI, Type } from "@google/genai";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { prisma } from "@/lib/prisma";
import { getS3Client, s3Bucket, s3Key, getPublicUrl } from "@/lib/s3";
import { resolveOwner, isAllowed } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash"; // accepts video/audio; cheap + fast

const PROMPT = `You receive a media file (video or audio) that contains speech.
1. Detect the main spoken language and return its ISO-639-1 code (e.g. "ru", "es", "en", "it").
2. Transcribe ALL speech accurately, with correct punctuation and paragraph breaks.
   Do not add filler, timestamps or speaker labels unless clearly distinguishable.
3. Write a concise SUMMARY of the content in the SAME language as the speech:
   key points, decisions, names and numbers. A few short paragraphs or bullet points.
4. Produce a short descriptive TITLE (max ~6 words) in the same language.
If the file has no intelligible speech, return empty strings for transcript and summary.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    language: { type: Type.STRING },
    title: { type: Type.STRING },
    transcript: { type: Type.STRING },
    summary: { type: Type.STRING },
  },
  required: ["language", "title", "transcript", "summary"],
};

const genConfig = {
  temperature: 0.2,
  responseMimeType: "application/json",
  responseSchema,
};

type GeminiResult = {
  language: string;
  title: string;
  transcript: string;
  summary: string;
};

// Strip the video track and re-encode the audio to mono 16 kHz MP3. Gemini is
// billed on audio seconds (32 tok/s) regardless of bitrate, so sending only the
// audio — not the video frames — roughly halves the per-hour cost. ffmpeg-static
// ships the binary via npm (correct arch installed by `npm ci` on the server).
// Resolve the ffmpeg binary at runtime. ffmpeg-static bakes an absolute path via
// __dirname which the bundler can rewrite to a build-time path, so fall back to
// the binary inside the running app's node_modules (pm2 cwd).
function resolveFfmpeg(): string {
  const candidates = [
    process.env.FFMPEG_PATH,
    ffmpegStatic,
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
  ].filter((p): p is string => Boolean(p));
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("ffmpeg binary not found");
}

async function extractAudio(buf: Buffer, ext: string): Promise<Buffer> {
  const ffmpegPath = resolveFfmpeg();
  const dir = await mkdtemp(join(tmpdir(), "transcribe-"));
  const inPath = join(dir, `in.${ext || "mp4"}`);
  const outPath = join(dir, "out.mp3");
  await writeFile(inPath, buf);
  try {
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(ffmpegPath, [
        "-i", inPath,
        "-vn", // drop video
        "-ac", "1", // mono
        "-ar", "16000", // 16 kHz is plenty for speech
        "-b:a", "64k",
        "-f", "mp3",
        "-y", outPath,
      ]);
      let err = "";
      ff.stderr.on("data", (d) => (err += d.toString()));
      ff.on("error", reject);
      ff.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`)),
      );
    });
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Upload to the Gemini Files API and poll until the file is ACTIVE (processed).
// inlineData caps at ~20MB per request, so longer media must go through Files API.
async function uploadToGemini(buf: Buffer, mimeType: string, name: string) {
  const blob = new Blob([new Uint8Array(buf)], { type: mimeType });
  let file = await ai.files.upload({ file: blob, config: { mimeType, displayName: name } });

  // Poll up to ~2 min for the media to finish processing.
  const deadline = Date.now() + 120_000;
  while (file.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await ai.files.get({ name: file.name as string });
  }
  if (file.state !== "ACTIVE") {
    throw new Error(`Gemini не смог обработать файл (state=${file.state ?? "unknown"})`);
  }
  return file;
}

export async function POST(req: NextRequest) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }

    const fileName =
      (file instanceof File && file.name) || `upload-${Date.now()}.mp4`;
    const mimeType = file.type || "video/mp4";
    const ext = fileName.includes(".") ? fileName.split(".").pop()! : "mp4";
    const buf = Buffer.from(await file.arrayBuffer());

    // 1) Extract the audio track (mono 16 kHz MP3) — we only bill/transcribe sound.
    const audioBuf = await extractAudio(buf, ext);
    const audioMime = "audio/mpeg";

    // 2) Gemini: transcribe + summarize from the audio.
    const gFile = await uploadToGemini(audioBuf, audioMime, `${fileName}.mp3`);
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { fileData: { mimeType: audioMime, fileUri: gFile.uri as string } },
          ],
        },
      ],
      config: genConfig,
    });
    const result: GeminiResult = JSON.parse(response.text ?? "{}");

    if (!result.transcript?.trim()) {
      return NextResponse.json({ error: "Не удалось распознать речь в файле" }, { status: 422 });
    }

    // 3) Persist the row.
    const row = await prisma.transcription.create({
      data: {
        ownerKey: owner,
        title: result.title?.trim() || fileName,
        fileName,
        mimeType,
        sizeBytes: buf.length,
        language: result.language?.trim() || "",
        transcript: result.transcript.trim(),
        summary: result.summary?.trim() || "",
      },
    });

    // 4) Best-effort: archive the original file to S3 (don't fail the request).
    let fileUrl: string | null = null;
    try {
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const key = s3Key("uploads", yyyy, mm, `${row.id}.${ext}`);
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: s3Bucket(),
          Key: key,
          Body: buf,
          ContentType: mimeType,
        }),
      );
      fileUrl = getPublicUrl(key);
      await prisma.transcription.update({ where: { id: row.id }, data: { fileUrl } });
    } catch {
      /* S3 archival is optional — transcript/summary are already saved */
    }

    // 5) Clean up the temporary Gemini file (best-effort).
    try {
      await ai.files.delete({ name: gFile.name as string });
    } catch {
      /* ignore */
    }

    return NextResponse.json({ id: row.id, ...result, fileUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
