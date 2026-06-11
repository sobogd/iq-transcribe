"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  Trash2,
  Pencil,
  Download,
  FileText,
  Sparkles,
} from "lucide-react";
import { EditFieldModal } from "@/components/EditFieldModal";
import { apiFetch, initTelegram, showBackButton, haptic, isTelegram } from "@/lib/client";
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

export default function TranscriptionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [row, setRow] = useState<TranscriptionRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [inTg, setInTg] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/transcriptions/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) setRow(await res.json());
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    initTelegram();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInTg(isTelegram());
    const hide = showBackButton(() => router.push("/"));
    load();
    return hide;
  }, [load, router]);

  async function saveTitle(v: string) {
    if (!v.trim()) return;
    await apiFetch(`/api/transcriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: v }),
    });
    await load();
    setEditTitle(false);
  }

  async function remove() {
    if (!confirm("Удалить расшифровку?")) return;
    haptic();
    await apiFetch(`/api/transcriptions/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (notFound) {
    return (
      <main
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4"
        style={{ background: "var(--bg)", color: "var(--hint)" }}
      >
        Расшифровка не найдена.
        <button onClick={() => router.push("/")} className="text-emerald-500">
          ← К списку
        </button>
      </main>
    );
  }

  return (
    <main
      className="flex min-h-[100dvh] flex-col"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <header
        className="flex shrink-0 items-center gap-2.5 border-b px-2 py-2"
        style={{ background: "var(--accent)", borderColor: "var(--border)" }}
      >
        {!inTg && (
          <button
            onClick={() => router.push("/")}
            aria-label="Назад"
            className="rounded-lg p-1.5 transition active:scale-90"
            style={{ color: "var(--hint)" }}
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-base font-semibold">
            {row?.title || row?.fileName || "…"}
          </div>
          <div className="truncate text-xs" style={{ color: "var(--hint)" }}>
            {langLabel(row?.language)}
            {row?.language ? " · " : ""}
            {fmtSize(row?.sizeBytes)}
          </div>
        </div>
        <button
          onClick={() => setEditTitle(true)}
          aria-label="Переименовать"
          className="rounded-lg p-1.5 transition active:scale-90"
          style={{ color: "var(--hint)" }}
        >
          <Pencil size={18} />
        </button>
        <button
          onClick={remove}
          aria-label="Удалить"
          className="rounded-lg p-1.5 text-red-500 transition active:scale-90"
        >
          <Trash2 size={18} />
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4">
        {row?.fileUrl && (
          <a
            href={row.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-sm transition active:scale-95"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--hint)" }}
          >
            <Download size={14} /> Исходный файл
          </a>
        )}

        {/* Summary */}
        <section
          className="rounded-2xl border p-4 shadow-sm"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="mb-2 flex items-center gap-2">
            <Sparkles size={15} className="text-emerald-500" />
            <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--hint)" }}>
              Саммери
            </h2>
            {row?.summary && <CopyButton text={row.summary} />}
          </div>
          <p className="whitespace-pre-wrap text-base leading-relaxed">
            {row?.summary || "—"}
          </p>
        </section>

        {/* Transcript */}
        <section
          className="rounded-2xl border p-4 shadow-sm"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="mb-2 flex items-center gap-2">
            <FileText size={15} className="text-emerald-500" />
            <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--hint)" }}>
              Расшифровка
            </h2>
            {row?.transcript && <CopyButton text={row.transcript} />}
          </div>
          <p className="whitespace-pre-wrap text-base leading-relaxed">
            {row?.transcript || "—"}
          </p>
        </section>
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
    </main>
  );
}
