/**
 * Next.js startup hook. Runs once per process when the server boots.
 * Prewarms expensive singletons so the first user-facing request does
 * not pay the cold-start tax (ONNX model load, DB pool open, etc.).
 *
 * The function is intentionally fire-and-forget. Failures are logged
 * but do not block boot — the same code paths recover lazily on first
 * use if prewarm fails (e.g., model weights still downloading).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.OOTAOS_SKIP_PREWARM === '1') return;

  const t0 = Date.now();
  try {
    const { embed } = await import('@/lib/ai/embed');
    await embed('warmup', 'query');
    console.warn(`[instrumentation] embedder warm in ${Date.now() - t0}ms`);
  } catch (err) {
    console.warn('[instrumentation] embedder prewarm failed', err);
  }
}
