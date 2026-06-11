import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { getS3Client, s3Bucket } from "@/lib/s3";
import { resolveOwner, isAllowed } from "@/lib/auth";

export const runtime = "nodejs";

// Strip the public-URL prefix to recover the S3 object key.
function s3KeyFromUrl(url: string): string | null {
  const prefix = `${process.env.S3_HOST}/${process.env.S3_NAME}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { id } = await params;
    const row = await prisma.transcription.findUnique({ where: { id } });
    if (!row || row.ownerKey !== owner) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { id } = await params;
    const existing = await prisma.transcription.findUnique({ where: { id } });
    if (!existing || existing.ownerKey !== owner) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const body = await req.json();
    const data: { title?: string } = {};
    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ error: "empty title" }, { status: 400 });
      data.title = t;
    }
    const row = await prisma.transcription.update({ where: { id }, data });
    return NextResponse.json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { id } = await params;
    const row = await prisma.transcription.findUnique({ where: { id } });
    if (!row || row.ownerKey !== owner) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // Best-effort: remove the stored audio object so it doesn't orphan in S3.
    if (row.audioUrl) {
      const key = s3KeyFromUrl(row.audioUrl);
      if (key) {
        try {
          await getS3Client().send(
            new DeleteObjectCommand({ Bucket: s3Bucket(), Key: key }),
          );
        } catch {
          /* ignore — the DB row is what matters */
        }
      }
    }

    await prisma.transcription.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
