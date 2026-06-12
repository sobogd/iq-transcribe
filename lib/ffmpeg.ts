import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";

// Resolve the ffmpeg binary at runtime. ffmpeg-static bakes an absolute path via
// __dirname which the bundler can rewrite to a build-time path, so fall back to
// the binary inside the running app's node_modules (pm2 cwd).
export function resolveFfmpeg(): string {
  const candidates = [
    process.env.FFMPEG_PATH,
    ffmpegStatic,
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
  ].filter((p): p is string => Boolean(p));
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("ffmpeg binary not found");
}

export async function runFfmpeg(args: string[]): Promise<void> {
  const bin = resolveFfmpeg();
  await new Promise<void>((resolve, reject) => {
    const ff = spawn(bin, args);
    let err = "";
    ff.stderr.on("data", (d) => (err += d.toString()));
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`)),
    );
  });
}

// Strip the video track and re-encode to mono 16 kHz MP3 (plenty for speech).
export async function extractAudio(inPath: string, outPath: string): Promise<void> {
  await runFfmpeg([
    "-i", inPath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "64k",
    "-f", "mp3",
    "-y", outPath,
  ]);
}

// Split an MP3 into ~segSeconds chunks; returns the chunk file paths in order.
export async function segmentAudio(
  inPath: string,
  dir: string,
  segSeconds: number,
): Promise<string[]> {
  const pattern = join(dir, "chunk%03d.mp3");
  await runFfmpeg([
    "-i", inPath,
    "-f", "segment",
    "-segment_time", String(segSeconds),
    "-c", "copy",
    "-y", pattern,
  ]);
  const files = (await readdir(dir))
    .filter((f) => /^chunk\d+\.mp3$/.test(f))
    .sort();
  return files.map((f) => join(dir, f));
}
