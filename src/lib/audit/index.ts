import { auditEventsRepo, type AuditEventInsert } from '@/lib/db/repos/audit-events';

type AuditInput = {
  workspaceId: string;
  actorUserId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

export async function audit(input: AuditInput) {
  const row: AuditEventInsert = {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: input.action,
    payload: input.payload ?? {},
  };
  if (input.targetType !== undefined) row.targetType = input.targetType;
  if (input.targetId !== undefined) row.targetId = input.targetId;
  if (input.ip !== undefined) row.ip = input.ip;
  if (input.userAgent !== undefined) row.userAgent = input.userAgent;
  await auditEventsRepo.record(row);
}
