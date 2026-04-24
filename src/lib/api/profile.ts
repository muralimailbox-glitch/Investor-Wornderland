export type FounderProfile = {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  whatsappE164: string | null;
  publicEmail: string | null;
  signatureMarkdown: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  logoUrl: string | null;
  avatarUrl: string | null;
  defaultTimezone: string | null;
};

export async function getProfile(): Promise<FounderProfile> {
  const res = await fetch('/api/v1/admin/auth/profile', { credentials: 'include' });
  if (!res.ok) throw new Error(`profile_load_failed_${res.status}`);
  return (await res.json()) as FounderProfile;
}

export async function updateProfile(
  patch: Partial<Omit<FounderProfile, 'id' | 'email' | 'role'>>,
): Promise<FounderProfile> {
  const res = await fetch('/api/v1/admin/auth/profile', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`profile_update_failed_${res.status}`);
  return (await res.json()) as FounderProfile;
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const res = await fetch('/api/v1/admin/auth/password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`password_change_failed_${res.status}`);
}
