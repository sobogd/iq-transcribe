"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";

export function EditFieldModal({
  heading,
  placeholder,
  initial,
  multiline,
  onClose,
  onSave,
}: {
  heading: string;
  placeholder: string;
  initial: string;
  multiline?: boolean;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    const vh = (window.visualViewport?.height ?? window.innerHeight) || 600;
    const max = Math.round(vh * 0.32);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }
  useEffect(() => {
    if (multiline) requestAnimationFrame(autosize);
  }, [multiline]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl border p-5 shadow-xl sm:rounded-2xl"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 transition active:scale-90"
            style={{ color: "var(--hint)" }}
          >
            <X size={18} />
          </button>
        </div>

        {multiline ? (
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onInput={autosize}
            autoFocus
            rows={3}
            placeholder={placeholder}
            className="w-full resize-none overflow-y-auto rounded-xl border px-3 py-3 text-base leading-relaxed outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            style={{ background: "var(--bg)", borderColor: "var(--border)" }}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) save();
            }}
            className="w-full rounded-xl border px-3 py-3 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            style={{ background: "var(--bg)", borderColor: "var(--border)" }}
          />
        )}

        <button
          onClick={save}
          disabled={busy || (!multiline && !value.trim())}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}
