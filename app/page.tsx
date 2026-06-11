"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, Loader2, Lock } from "lucide-react";
import { UploadModal } from "@/components/UploadModal";
import { apiFetch, initTelegram, telegramUserId } from "@/lib/client";
import { langLabel, type TranscriptionListItem } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [rows, setRows] = useState<TranscriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/transcriptions");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.ok) setRows(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initTelegram();
    // setRows runs only after the awaited fetch — not a synchronous cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function onDone(id: string) {
    router.push(`/c/${id}`);
  }

  if (forbidden) {
    const id = telegramUserId();
    return (
      <main
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: "var(--bg)", color: "var(--text)" }}
      >
        <Lock size={30} className="text-emerald-500" />
        <p className="text-base font-medium">Доступ ограничен</p>
        <p className="max-w-xs text-sm" style={{ color: "var(--hint)" }}>
          Приложение пока доступно только избранным. Отправьте свой Telegram-ID
          администратору, чтобы получить доступ.
        </p>
        {id && (
          <div
            className="rounded-xl border px-4 py-2 font-mono text-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            ID: {id}
          </div>
        )}
      </main>
    );
  }

  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center px-4 py-6"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <header className="flex items-center justify-between pt-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Транскри<span className="text-emerald-500">bator</span>
          </h1>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-emerald-500 active:scale-95"
          >
            <Plus size={16} /> Загрузить
          </button>
        </header>

        {loading ? (
          <div className="flex justify-center py-16" style={{ color: "var(--hint)" }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 py-16 text-center"
            style={{ color: "var(--hint)" }}
          >
            <FileText size={26} />
            <p className="text-sm">
              Пока пусто. Загрузите видео (MP4) — получите расшифровку речи и
              краткое саммери.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div
                key={r.id}
                onClick={() => router.push(`/c/${r.id}`)}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 shadow-sm transition active:scale-[0.99]"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="shrink-0 text-emerald-500" />
                    <span className="truncate font-medium">{r.title || r.fileName}</span>
                  </div>
                  {r.summary && (
                    <p
                      className="mt-1 line-clamp-2 text-sm"
                      style={{ color: "var(--hint)" }}
                    >
                      {r.summary}
                    </p>
                  )}
                  <p className="mt-1 text-xs" style={{ color: "var(--hint)" }}>
                    {langLabel(r.language)}
                    {r.language ? " · " : ""}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onDone={onDone} />
      )}
    </main>
  );
}
