import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash"; // accepts audio; cheap + fast

const TRANSCRIBE_PROMPT = `Transcribe ALL speech in this audio accurately, with
correct punctuation and natural paragraph breaks. Output ONLY the transcript
text — no commentary, no timestamps, no speaker labels, no markdown. If there is
no intelligible speech, output nothing.`;

const SUMMARY_PROMPT = `You are given a transcript of an audio recording.
1. Detect the main language and return its ISO-639-1 code (e.g. "ru", "es", "en").
2. Produce a short descriptive TITLE (max ~6 words) in that language.
3. Write a concise SUMMARY in that SAME language: key points, decisions, names
   and numbers, as a few short paragraphs or bullet points.`;

const summarySchema = {
  type: Type.OBJECT,
  properties: {
    language: { type: Type.STRING },
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
  },
  required: ["language", "title", "summary"],
};

export type SummaryResult = { language: string; title: string; summary: string };

// Upload to the Gemini Files API and poll until the file is ACTIVE (processed).
async function uploadToGemini(buf: Buffer, mimeType: string, name: string) {
  const blob = new Blob([new Uint8Array(buf)], { type: mimeType });
  let file = await ai.files.upload({ file: blob, config: { mimeType, displayName: name } });

  const deadline = Date.now() + 120_000;
  while (file.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await ai.files.get({ name: file.name as string });
  }
  if (file.state !== "ACTIVE") {
    throw new Error(`Gemini не смог обработать аудио (state=${file.state ?? "unknown"})`);
  }
  return file;
}

// Transcribe a single audio chunk to PLAIN TEXT. Streaming avoids undici's 300s
// headers timeout; plain text (no JSON) means a long transcript can't truncate
// into invalid JSON — chunks keep each response well under the output cap.
export async function transcribeChunk(audioBuf: Buffer): Promise<string> {
  const audioMime = "audio/mpeg";
  const gFile = await uploadToGemini(audioBuf, audioMime, `chunk-${Date.now()}.mp3`);
  try {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: TRANSCRIBE_PROMPT },
            { fileData: { mimeType: audioMime, fileUri: gFile.uri as string } },
          ],
        },
      ],
      config: { temperature: 0.2 },
    });
    let text = "";
    for await (const chunk of stream) text += chunk.text ?? "";
    return text.trim();
  } finally {
    try {
      await ai.files.delete({ name: gFile.name as string });
    } catch {
      /* best-effort cleanup */
    }
  }
}

// Summarize the full (joined) transcript. Output is small, so JSON is safe here.
export async function summarize(transcript: string): Promise<SummaryResult> {
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: `${SUMMARY_PROMPT}\n\nTRANSCRIPT:\n${transcript}` }] }],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: summarySchema,
    },
  });
  let text = "";
  for await (const chunk of stream) text += chunk.text ?? "";
  return JSON.parse(text || "{}");
}

// Run an async mapper over items with a bounded concurrency, preserving order.
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
