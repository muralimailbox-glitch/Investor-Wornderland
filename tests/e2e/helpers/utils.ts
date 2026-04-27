export function randomEmail(tag = 'e2e'): string {
  const stamp = Date.now();
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${tag}.${stamp}.${nonce}@example.com`;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function poll<T>(
  fn: () => Promise<T | null | undefined>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = await fn();
    if (value != null) return value;
    if (Date.now() >= deadline) {
      throw new Error(`poll timeout${opts.label ? `: ${opts.label}` : ''}`);
    }
    await sleep(intervalMs);
  }
}

export async function expectProblemJson(
  res: { status(): number; json(): Promise<unknown> },
  expectedStatus: number,
) {
  if (res.status() !== expectedStatus) {
    throw new Error(`expected ${expectedStatus}, received ${res.status()}`);
  }
  return (await res.json()) as {
    type?: string;
    title?: string;
    status?: number;
    detail?: string;
    code?: string;
  };
}
