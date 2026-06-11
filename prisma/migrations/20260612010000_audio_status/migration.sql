-- Two-step flow: store extracted audio, transcription is triggered later.
ALTER TABLE "transcriptions" DROP COLUMN IF EXISTS "fileUrl";
ALTER TABLE "transcriptions" ADD COLUMN IF NOT EXISTS "audioUrl" TEXT;
ALTER TABLE "transcriptions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'done';
ALTER TABLE "transcriptions" ADD COLUMN IF NOT EXISTS "error" TEXT;
