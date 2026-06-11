# Transcribe — видео/аудио → текст + саммери

Telegram Mini App: загружаешь файл (MP4), Gemini расшифровывает речь в текст и
делает краткое саммери. История хранится per-owner (Telegram id / device id),
тот же allowlist и auth, что и в `translator`.

## Стек
- Next.js 16 (App Router), React 19, Tailwind 4
- Prisma + Postgres (таблица `transcriptions`)
- Gemini `gemini-2.5-flash` через Files API (видео > 20MB)
- S3 (Hetzner) — best-effort архив исходного файла
- Telegram WebApp initData (HMAC-проверка в `lib/auth.ts`)

## Локально
```bash
createdb transcribe
cp .env.local .env   # заполнить BOT_TOKEN при необходимости
npm install
npx prisma migrate dev
npm run dev          # http://localhost:3000
```

## Прод
- Домен: `transcribe.iq-factura.com`
- PM2 process `transcribe`, порт **8202**, dir `/home/deploy/apps/transcribe`
- Деплой: push в ветку `release` → `.github/workflows/deploy.yml`
- nginx: `nginx/transcribe.conf`

### GitHub secrets (repo `sobogd/iq-transcribe`)
`DATABASE_URL GEMINI_API_KEY S3_HOST S3_REGION S3_KEY S3_TOKEN S3_NAME BOT_TOKEN ALLOWED_TG_IDS SERVER_IP SSH_KEY`
