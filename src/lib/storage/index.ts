import { env } from '@/lib/env';

import type { FileStorage } from './interface';
import { PostgresFileStorage } from './postgres-storage';
import { R2FileStorage } from './r2-class';

let _storage: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (_storage) return _storage;
  _storage = env.FILE_STORAGE_DRIVER === 'r2' ? new R2FileStorage() : new PostgresFileStorage();
  return _storage;
}

export type { FileStorage };
