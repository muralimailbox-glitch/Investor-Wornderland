-- 0013: backfill documents.deal_id for rows uploaded before deal-scoping.
--
-- Phase 1 of the fundraising-OS added documents.deal_id but the upload route
-- never wrote it. The public fetch gate's `if (doc.dealId && doc.dealId !==
-- dealId)` let null-dealId rows leak across deals. After this migration plus
-- the route fix, every document is bound to a deal and the gate becomes
-- `if (!doc.dealId || doc.dealId !== dealId)` (non-null required).
--
-- For each workspace, we pick the most-recently-created deal as the home
-- for any orphan documents. Single-deal workspaces (the common case today)
-- end up with all docs bound to that one deal — matching the pre-migration
-- public behaviour.

UPDATE documents AS d
SET deal_id = (
  SELECT id FROM deals
  WHERE workspace_id = d.workspace_id
  ORDER BY created_at DESC
  LIMIT 1
)
WHERE d.deal_id IS NULL
  AND EXISTS (SELECT 1 FROM deals WHERE workspace_id = d.workspace_id);
