/**
 * Async wrapper around readNdaSession that consults the database to enforce
 * NDA revocation. Public routes that gate on the NDA cookie (data-room read,
 * document fetch, AI ask, meeting booking) MUST call this rather than
 * readNdaSession directly so a revoked NDA cuts off access within one
 * request — satisfying the SRS 10-second invalidation requirement.
 *
 * readNdaSession remains for legacy / non-data-access call sites (e.g. just
 * resolving an investor's email for a non-sensitive operation).
 */
import { ndasRepo } from '@/lib/db/repos/ndas';

import { readNdaSession, type NdaSession } from './nda-session';

export async function getActiveNdaSession(
  cookieValue: string | undefined | null,
): Promise<NdaSession | null> {
  const session = readNdaSession(cookieValue);
  if (!session) return null;
  // Stateless cookie passed HMAC + expiry. Now consult the DB for the
  // revocation flag. One indexed PK lookup per gated request — cost is
  // negligible vs the work the route is about to do.
  const active = await ndasRepo.isActive(session.ndaId);
  if (!active) return null;
  return session;
}
