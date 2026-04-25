import type { FileStorage } from './interface';
import { deleteObject, getObjectBytes, objectExists, putObject, signedDownloadUrl } from './r2';

export class R2FileStorage implements FileStorage {
  async put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    await putObject(key, body instanceof Buffer ? body : Buffer.from(body), contentType);
  }

  async get(key: string): Promise<Uint8Array> {
    return getObjectBytes(key);
  }

  async url(key: string, expiresInSeconds = 900): Promise<string> {
    return signedDownloadUrl(key, expiresInSeconds);
  }

  async delete(key: string): Promise<void> {
    await deleteObject(key);
  }

  async exists(key: string): Promise<boolean> {
    return objectExists(key);
  }
}
