import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash"; // accepts audio; cheap + fast

const PROMPT = `You receive an audio file that contains speech.
1. Detect the main spoken language and return its ISO-639-1 code (e.g. "ru", "es", "en", "it").
2. Transcribe ALL speech accurately, with correct punctuation and paragraph breaks.
   Do not add filler, timestamps or speaker labels unless clearly distinguishable.
3. Write a concise SUMMARY of the content in the SAME language as the speech:
   key points, decisions, names and numbers. A few short paragraphs or bullet points.
4. Produce a short descriptive TITLE (max ~6 words) in the same language.
If the audio has no intelligible speech, return empty strings for transcript and summary.`;

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

export type GeminiResult = {
  language: string;
  title: string;
  transcript: string;
  summary: string;
};

// Upload to the Gemini Files API and poll until the file is ACTIVE (processed).
// inlineData caps at ~20MB per request, so longer audio must go through Files API.
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

// Transcribe + summarize an MP3 audio buffer. Throws on hard failure; returns
// empty transcript/summary when there is no intelligible speech.
export async function transcribeAudio(audioBuf: Buffer): Promise<GeminiResult> {
  const audioMime = "audio/mpeg";
  const gFile = await uploadToGemini(audioBuf, audioMime, `audio-${Date.now()}.mp3`);
  try {
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
    return JSON.parse(response.text ?? "{}");
  } finally {
    try {
      await ai.files.delete({ name: gFile.name as string });
    } catch {
      /* best-effort cleanup */
    }
  }
}
