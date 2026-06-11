export type TranscriptionRow = {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string | null;
  mimeType: string;
  sizeBytes: number | null;
  language: string;
  transcript: string;
  summary: string;
  createdAt: string;
};

export type TranscriptionListItem = Pick<
  TranscriptionRow,
  "id" | "title" | "fileName" | "language" | "summary" | "createdAt"
>;

export const langLabel = (l?: string) => {
  const map: Record<string, string> = {
    ru: "🇷🇺 Русский",
    es: "🇪🇸 Español",
    en: "🇬🇧 English",
    it: "🇮🇹 Italiano",
    pt: "🇵🇹 Português",
    de: "🇩🇪 Deutsch",
    fr: "🇫🇷 Français",
  };
  return l ? map[l] ?? l.toUpperCase() : "";
};

export const fmtSize = (bytes?: number | null) => {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
};
