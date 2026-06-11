"use client";

import { useRef, useState } from "react";
import { X, Loader2, UploadCloud, FileVideo } from "lucide-react";
import { authHeaders } from "@/lib/client";
import { fmtSize } from "@/lib/types";

// Accepted media: start with mp4, but allow common audio/video the model handles.
const ACCEPT = "video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a";

type Phase = "idle" | "uploading" | "processing";

export function UploadModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0); // upload %, 0–100
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase !== "idle";

  // fetch() can't report upload progress, so use XHR for the big media POST.
  function upload() {
    if (!file || busy) return;
    setError(null);
    setProgress(0);
    setPhase("uploading");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/transcribe");
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);
    // Send the raw file (not multipart) so the server streams it straight to
    // disk without buffering the whole video in RAM. Name travels in a header.
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      setProgress(pct);
      // once bytes are all sent, the server is extracting + storing the audio
      if (pct >= 100) setPhase("processing");
    };

    xhr.onload = () => {
      let data: { id?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { error: `Ошибка сервера (${xhr.status})` };
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.id) {
        onDone(data.id);
      } else {
        setError(data.error || `Ошибка сервера (${xhr.status})`);
        setPhase("idle");
      }
    };

    xhr.onerror = () => {
      setError("Сбой сети при загрузке");
      setPhase("idle");
    };

    xhr.send(file);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl border p-5 shadow-xl sm:rounded-2xl"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Загрузить файл</h2>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 transition active:scale-90 disabled:opacity-40"
            style={{ color: "var(--hint)" }}
          >
            <X size={18} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setError(null);
          }}
        />

        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          {file ? (
            <>
              <FileVideo size={26} className="text-emerald-500" />
              <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
              <span className="text-xs" style={{ color: "var(--hint)" }}>
                {fmtSize(file.size)} · нажми, чтобы заменить
              </span>
            </>
          ) : (
            <>
              <UploadCloud size={26} className="text-emerald-500" />
              <span className="text-sm font-medium">Выбрать видео (MP4)</span>
              <span className="text-xs" style={{ color: "var(--hint)" }}>
                Извлечём аудио, потом транскрибируешь в текст + саммери
              </span>
            </>
          )}
        </button>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {phase === "uploading" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs" style={{ color: "var(--hint)" }}>
              <span>Загрузка…</span>
              <span>{progress}%</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--border)" }}
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={upload}
          disabled={!file || busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {phase === "uploading"
            ? `Загрузка ${progress}%`
            : phase === "processing"
              ? "Извлекаю аудио…"
              : "Загрузить"}
        </button>
        {busy && (
          <p className="text-center text-xs" style={{ color: "var(--hint)" }}>
            {phase === "uploading"
              ? "Идёт загрузка файла — не закрывайте окно."
              : "Извлекаю аудиодорожку — не закрывайте окно."}
          </p>
        )}
      </div>
    </div>
  );
}
