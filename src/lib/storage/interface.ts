export interface FileStorage {
  put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  url(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
