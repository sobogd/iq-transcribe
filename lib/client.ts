"use client";

// Client identity + fetch wrapper. Inside Telegram we send the signed initData
// (server verifies it); elsewhere we fall back to an anonymous device id stored
// in localStorage (data isolation per browser/device, no registration).

type ThemeParams = Record<string, string>;

type TgWebApp = {
  initData?: string;
  colorScheme?: "light" | "dark";
  themeParams?: ThemeParams;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  onEvent?: (e: string, cb: () => void) => void;
  offEvent?: (e: string, cb: () => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: { impactOccurred?: (s: string) => void };
};

function tg(): TgWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

export function isTelegram(): boolean {
  return !!tg()?.initData;
}

export function telegramUserId(): string | null {
  const u = (tg() as unknown as { initDataUnsafe?: { user?: { id?: number } } })
    ?.initDataUnsafe?.user?.id;
  return u ? String(u) : null;
}

function deviceId(): string {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("deviceId", id);
  }
  return id;
}

export function authHeaders(): Record<string, string> {
  const initData = tg()?.initData;
  if (initData) return { "X-Telegram-Init-Data": initData };
  return { "X-Device-Id": deviceId() };
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(authHeaders())) headers.set(k, v);
  return fetch(input, { ...init, headers });
}

// Map Telegram themeParams onto our CSS vars so the app matches the client.
function applyTheme() {
  const w = tg();
  const p = w?.themeParams;
  if (!p) return;
  const root = document.documentElement;
  const set = (name: string, val?: string) => val && root.style.setProperty(name, val);
  // page = greyish (secondary), header/footer/cards = white (surface)
  const surface = p.section_bg_color || p.bg_color;
  set("--bg", p.secondary_bg_color || p.bg_color);
  set("--accent", surface);
  set("--card", surface);
  set("--text", p.text_color);
  set("--hint", p.hint_color || p.subtitle_text_color);
  set("--border", p.section_separator_color || p.hint_color);
  set("--button", p.button_color);
  set("--button-text", p.button_text_color);
  if (p.secondary_bg_color) w?.setBackgroundColor?.(p.secondary_bg_color);
  if (surface) w?.setHeaderColor?.(surface);
}

// Call once on app load: signal readiness, expand viewport, sync theme.
export function initTelegram() {
  const w = tg();
  if (!w) return;
  w.ready?.();
  w.expand?.();
  applyTheme();
  w.onEvent?.("themeChanged", applyTheme);
}

// Telegram native back button (no-op outside Telegram).
export function showBackButton(cb: () => void) {
  const b = tg()?.BackButton;
  if (!b) return () => {};
  b.onClick(cb);
  b.show();
  return () => {
    b.offClick(cb);
    b.hide();
  };
}

export function haptic() {
  tg()?.HapticFeedback?.impactOccurred?.("light");
}
