import { NextResponse } from "next/server";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { resolveOwner, isAllowed } from "@/lib/auth";
import { segmentAudio } from "@/lib/ffmpeg";
import { transcribeChunk, summarize, mapLimit } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 600;

const SEGMENT_SECONDS = 600; // ~10-min chunks keep each response well under the output cap
const CHUNK_CONCURRENCY = 4; // parallel Gemini calls

// Transcribe the already-extracted audio: split into chunks, transcribe each in
// parallel (plain text), join in order, then summarize the whole thing.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const owner = resolveOwner(req);
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const row = await prisma.transcription.findUnique({ where: { id } });
  if (!row || row.ownerKey !== owner) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!row.audioUrl) {
    return NextResponse.json({ error: "нет сохранённого аудио" }, { status: 400 });
  }

  await prisma.transcription.update({ where: { id }, data: { status: "processing" } });

  const dir = await mkdtemp(join(tmpdir(), "transcribe-"));
  const audioPath = join(dir, "audio.mp3");

  try {
    const res = await fetch(row.audioUrl);
    if (!res.ok) throw new Error(`не удалось загрузить аудио (${res.status})`);
    await writeFile(audioPath, Buffer.from(await res.arrayBuffer()));

    // Split into chunks; transcribe each in parallel (bounded), keep order.
    const chunkPaths = await segmentAudio(audioPath, dir, SEGMENT_SECONDS);
    const parts = await mapLimit(chunkPaths, CHUNK_CONCURRENCY, async (p) =>
      transcribeChunk(await readFile(p)),
    );
    const transcript = parts.filter(Boolean).join("\n\n").trim();

    if (!transcript) {
      const updated = await prisma.transcription.update({
        where: { id },
        data: { status: "error", error: "Не удалось распознать речь в файле" },
      });
      return NextResponse.json(updated);
    }

    const meta = await summarize(transcript);
    const updated = await prisma.transcription.update({
      where: { id },
      data: {
        title: meta.title?.trim() || row.fileName,
        language: meta.language?.trim() || "",
        transcript,
        summary: meta.summary?.trim() || "",
        status: "done",
        error: null,
      },
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    const updated = await prisma.transcription.update({
      where: { id },
      data: { status: "error", error: msg },
    });
    return NextResponse.json(updated);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
