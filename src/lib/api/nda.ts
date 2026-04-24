export type NdaInitiateInput = {
  email: string;
  firstName: string;
  lastName: string;
  firmName: string;
  title: string;
};

export type NdaInitiateResult = {
  signingToken: string;
  expiresInSeconds: number;
};

export type NdaVerifyInput = {
  signingToken: string;
  otp: string;
};

export type NdaVerifyResult = { verified: true };

export type NdaSignInput = {
  signingToken: string;
  signerName: string;
  signerTitle: string;
  signerFirm: string;
  acceptTerms: true;
};

export type NdaSignResult = {
  ndaId: string;
  signedAt: string;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { title?: string } | null;
    throw new Error(data?.title ?? `${res.status}`);
  }
  return (await res.json()) as T;
}

export function initiateNda(input: NdaInitiateInput) {
  return post<NdaInitiateResult>('/api/v1/nda/initiate', input);
}

export function verifyNdaOtp(input: NdaVerifyInput) {
  return post<NdaVerifyResult>('/api/v1/nda/verify', input);
}

export function signNda(input: NdaSignInput) {
  return post<NdaSignResult>('/api/v1/nda/sign', input);
}
