export async function startPreview(input: {
  investorId?: string;
  returnTo?: string;
}): Promise<{ url: string; expiresAt: string }> {
  const res = await fetch('/api/v1/admin/preview/start', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`preview_start_failed_${res.status}`);
  return (await res.json()) as { url: string; expiresAt: string };
}

export async function exitPreview(): Promise<void> {
  await fetch('/api/v1/preview/exit', { method: 'POST', credentials: 'include' });
}
