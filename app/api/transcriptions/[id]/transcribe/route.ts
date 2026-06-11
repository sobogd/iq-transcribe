import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOwner, isAllowed } from "@/lib/auth";
import { transcribeAudio } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 600;

// Transcribe + summarize the already-extracted audio (step 2 of the flow).
// Works from "ready" or "error" status; on failure keeps the row with the error
// so the user can listen to the audio and trigger it again.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
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

    try {
      const res = await fetch(row.audioUrl);
      if (!res.ok) throw new Error(`не удалось загрузить аудио (${res.status})`);
      const audioBuf = Buffer.from(await res.arrayBuffer());

      const result = await transcribeAudio(audioBuf);
      if (!result.transcript?.trim()) {
        const updated = await prisma.transcription.update({
          where: { id },
          data: { status: "error", error: "Не удалось распознать речь в файле" },
        });
        return NextResponse.json(updated);
      }
      const updated = await prisma.transcription.update({
        where: { id },
        data: {
          title: result.title?.trim() || row.fileName,
          language: result.language?.trim() || "",
          transcript: result.transcript.trim(),
          summary: result.summary?.trim() || "",
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
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
