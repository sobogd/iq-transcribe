-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "transcriptions" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER,
    "language" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcriptions_ownerKey_idx" ON "transcriptions"("ownerKey");

