"use client";

import { useRef, useState } from "react";
import { X, Loader2, UploadCloud, FileVideo } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { fmtSize } from "@/lib/types";

// Accepted media: start with mp4, but allow common audio/video the model handles.
const ACCEPT = "video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a";

export function UploadModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await apiFetch("/api/transcribe", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка сервера");
      onDone(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
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
                Файл расшифруется в текст + краткое саммери
              </span>
            </>
          )}
        </button>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={upload}
          disabled={!file || busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? "Расшифровываю…" : "Расшифровать"}
        </button>
        {busy && (
          <p className="text-center text-xs" style={{ color: "var(--hint)" }}>
            Обработка видео занимает до пары минут — не закрывайте окно.
          </p>
        )}
      </div>
    </div>
  );
}
