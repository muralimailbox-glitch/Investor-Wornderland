import { env } from '@/lib/env';

/**
 * Local 384-dim embeddings via Xenova/transformers. Running inside the
 * Next.js Node runtime — no network round-trip, no per-call cost. The
 * model weights download once to ./models/ and are cached on disk.
 *
 * Kept deliberately thin: one public function `embed` that returns a
 * unit-normalized float32 array. Chunking lives in the ingestion service.
 */

type FeatureExtractor = (
  text: string | string[],
  options: { pooling: 'mean' | 'cls'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let pipelinePromise: Promise<FeatureExtractor> | null = null;

async function getPipeline(): Promise<FeatureExtractor> {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    // Dynamic import keeps the heavy ONNX runtime out of the cold start
    // path for requests that do not embed (e.g., cockpit queries).
    const mod = await import('@xenova/transformers');
    mod.env.allowLocalModels = true;
    mod.env.cacheDir = env.EMBEDDING_CACHE_DIR ?? './models';
    const extractor = await mod.pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    return extractor as unknown as FeatureExtractor;
  })();
  return pipelinePromise;
}

/** Returns a 384-dim unit vector. E5 models expect a "query:" / "passage:" prefix. */
export async function embed(
  text: string,
  kind: 'query' | 'passage' = 'passage',
): Promise<number[]> {
  const prefixed = `${kind}: ${text.slice(0, 4000)}`;
  const extractor = await getPipeline();
  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function embedBatch(
  texts: string[],
  kind: 'query' | 'passage' = 'passage',
): Promise<number[][]> {
  return Promise.all(texts.map((t) => embed(t, kind)));
}

export const EMBEDDING_DIM = 384;
