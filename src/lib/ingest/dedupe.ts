import { createHash } from 'node:crypto';

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Cosine similarity for unit-normalized vectors. Our embedder
 * (Xenova multilingual-e5-small) returns L2-normalized vectors, so this
 * reduces to a dot product.
 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

/** Greedy near-duplicate filter: returns indices to keep. */
export function dedupeByEmbedding(embeddings: number[][], threshold = 0.92): number[] {
  const keep: number[] = [];
  const kept: number[][] = [];
  for (let i = 0; i < embeddings.length; i++) {
    const v = embeddings[i];
    if (!v) continue;
    let dup = false;
    for (const k of kept) {
      if (cosineSim(v, k) >= threshold) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      keep.push(i);
      kept.push(v);
    }
  }
  return keep;
}
