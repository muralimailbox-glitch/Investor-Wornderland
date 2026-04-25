import { createHmac } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';

import { db } from '@/lib/db/client';
import { storedFiles } from '@/lib/db/schema';
import { env } from '@/lib/env';

import type { FileStorage } from './interface';

const MAX_COMPRESSED_BYTES = 5 * 1024 * 1024;

async function compressPdf(body: Uint8Array): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(body, { updateMetadata: false });
    return await doc.save({ useObjectStreams: true });
  } catch {
    return body;
  }
}

export class PostgresFileStorage implements FileStorage {
  async put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    const original = body instanceof Buffer ? new Uint8Array(body) : body;
    const sizeOriginal = original.length;

    let compressed: Uint8Array = original;
    if (contentType === 'application/pdf') {
      compressed = await compressPdf(original);
    }

    const sizeCompressed = compressed.length;

    if (sizeCompressed > MAX_COMPRESSED_BYTES) {
      const err = new Error(
        `file too large: ${sizeCompressed} bytes after compression exceeds 5 MB cap`,
      );
      (err as NodeJS.ErrnoException).code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }

    console.warn(
      `[storage:pg] put ${key}: original=${sizeOriginal}B compressed=${sizeCompressed}B ratio=${((sizeCompressed / sizeOriginal) * 100).toFixed(1)}%`,
    );

    await db
      .insert(storedFiles)
      .values({
        storageKey: key,
        contentType,
        sizeBytesOriginal: sizeOriginal,
        sizeBytesCompressed: sizeCompressed,
        content: Buffer.from(compressed),
      })
      .onConflictDoUpdate({
        target: storedFiles.storageKey,
        set: {
          contentType,
          sizeBytesOriginal: sizeOriginal,
          sizeBytesCompressed: sizeCompressed,
          content: Buffer.from(compressed),
        },
      });
  }

  async get(key: string): Promise<Uint8Array> {
    const rows = await db
      .select({ content: storedFiles.content, contentType: storedFiles.contentType })
      .from(storedFiles)
      .where(eq(storedFiles.storageKey, key))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error(`storage key not found: ${key}`);
    return new Uint8Array(row.content as Buffer);
  }

  async url(key: string, expiresInSeconds = 900): Promise<string> {
    const rows = await db
      .select({ contentType: storedFiles.contentType })
      .from(storedFiles)
      .where(eq(storedFiles.storageKey, key))
      .limit(1);
    const contentType = rows[0]?.contentType ?? 'application/octet-stream';

    const exp = Date.now() + expiresInSeconds * 1000;
    const sig = createHmac('sha256', env.AUTH_SECRET)
      .update(`${key}:${exp}:${contentType}`)
      .digest('hex');
    const encodedKey = Buffer.from(key).toString('base64url');
    const params = new URLSearchParams({ exp: String(exp), sig, ct: contentType });
    return `${env.NEXT_PUBLIC_SITE_URL}/api/v1/storage/${encodedKey}?${params}`;
  }

  async delete(key: string): Promise<void> {
    await db.delete(storedFiles).where(eq(storedFiles.storageKey, key));
  }

  async exists(key: string): Promise<boolean> {
    const rows = await db
      .select({ storageKey: storedFiles.storageKey })
      .from(storedFiles)
      .where(eq(storedFiles.storageKey, key))
      .limit(1);
    return rows.length > 0;
  }
}
