"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Pencil,
  Trash2,
  Loader2,
  Sparkles,
  FileText,
  Wand2,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { EditFieldModal } from "@/components/EditFieldModal";
import { apiFetch, haptic } from "@/lib/client";
import { langLabel, fmtSize, type TranscriptionRow } from "@/lib/types";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Копировать"
      className="rounded-lg p-1.5 text-emerald-600 transition active:scale-90 dark:text-emerald-400"
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

export function TranscriptionSheet({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [row, setRow] = useState<TranscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcribing, setTranscribing] = useState(false);
  const [editTitle, setEditTitle] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/transcriptions/${id}`);
      if (res.ok) setRow(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function transcribe() {
    if (transcribing) return;
    setTranscribing(true);
    haptic();
    try {
      const res = await apiFetch(`/api/transcriptions/${id}/transcribe`, { method: "POST" });
      if (res.ok) {
        setRow(await res.json());
        onChanged();
      }
    } catch {
      /* ignore */
    } finally {
      setTranscribing(false);
    }
  }

  async function saveTitle(v: string) {
    if (!v.trim()) return;
    await apiFetch(`/api/transcriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: v }),
    });
    await load();
    onChanged();
    setEditTitle(false);
  }

  async function remove() {
    if (!confirm("Удалить запись?")) return;
    haptic();
    await apiFetch(`/api/transcriptions/${id}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={transcribing ? undefined : onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border shadow-xl sm:rounded-2xl"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start gap-2 border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">
              {row?.title || row?.fileName || "…"}
            </div>
            <div className="truncate text-xs" style={{ color: "var(--hint)" }}>
              {langLabel(row?.language)}
              {row?.language ? " · " : ""}
              {fmtSize(row?.sizeBytes)}
            </div>
          </div>
          {row && (
            <button
              onClick={() => setEditTitle(true)}
              aria-label="Переименовать"
              className="rounded-lg p-1.5 transition active:scale-90"
              style={{ color: "var(--hint)" }}
            >
              <Pencil size={17} />
            </button>
          )}
          {row && (
            <button
              onClick={remove}
              aria-label="Удалить"
              className="rounded-lg p-1.5 text-red-500 transition active:scale-90"
            >
              <Trash2 size={17} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 transition active:scale-90"
            style={{ color: "var(--hint)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10" style={{ color: "var(--hint)" }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : !row ? (
            <p className="py-6 text-center text-sm" style={{ color: "var(--hint)" }}>
              Запись не найдена.
            </p>
          ) : (
            <>
              {row.audioUrl && (
                <audio controls src={row.audioUrl} className="w-full" preload="none" />
              )}

              {/* ready / error → transcribe button */}
              {(row.status === "ready" || row.status === "error") && (
                <>
                  {row.status === "error" && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <span>{row.error || "Расшифровка не удалась"}</span>
                    </div>
                  )}
                  <button
                    onClick={transcribe}
                    disabled={transcribing}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
                  >
                    {transcribing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                    {transcribing
                      ? "Транскрибирую…"
                      : row.status === "error"
                        ? "Повторить транскрибацию"
                        : "Транскрибировать"}
                  </button>
                  {!transcribing && row.status === "ready" && (
                    <p className="text-center text-xs" style={{ color: "var(--hint)" }}>
                      Аудио извлечено. Нажми, чтобы получить текст и саммери.
                    </p>
                  )}
                </>
              )}

              {row.status === "processing" && (
                <div
                  className="flex items-center gap-2 rounded-xl border p-3 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--hint)" }}
                >
                  <Loader2 size={15} className="animate-spin" /> Транскрибирую…
                </div>
              )}

              {row.status === "done" && (
                <>
                  <section
                    className="rounded-2xl border p-4"
                    style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles size={15} className="text-emerald-500" />
                      <h3 className="flex-1 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--hint)" }}>
                        Саммери
                      </h3>
                      {row.summary && <CopyButton text={row.summary} />}
                    </div>
                    <p className="whitespace-pre-wrap text-base leading-relaxed">
                      {row.summary || "—"}
                    </p>
                  </section>

                  <section
                    className="rounded-2xl border p-4"
                    style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <FileText size={15} className="text-emerald-500" />
                      <h3 className="flex-1 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--hint)" }}>
                        Расшифровка
                      </h3>
                      {row.transcript && <CopyButton text={row.transcript} />}
                    </div>
                    <p className="whitespace-pre-wrap text-base leading-relaxed">
                      {row.transcript || "—"}
                    </p>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {editTitle && row && (
        <EditFieldModal
          heading="Название"
          placeholder="Напр.: Планёрка 12 июня"
          initial={row.title}
          onClose={() => setEditTitle(false)}
          onSave={saveTitle}
        />
      )}
    </div>
  );
}
