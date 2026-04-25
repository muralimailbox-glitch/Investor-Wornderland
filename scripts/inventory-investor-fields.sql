-- Inventory: how much live data actually populates each investor + lead column?
-- Output guides which fields can be dropped without losing operator-curated data.
--
-- Usage (from your local checkout):
--   railway run psql $DATABASE_URL -f scripts/inventory-investor-fields.sql
--
-- Read the report top-down. A column with `0 / N` non-null rows is unused.
-- A column with high non-null count is load-bearing — make sure the refactor
-- preserves the data (move to leads/firms or keep on investors).

\echo '── investors: total rows and per-column non-null counts ──'
SELECT count(*) AS total_investors FROM investors;

SELECT
  count(*) FILTER (WHERE photo_url IS NOT NULL)               AS photo_url,
  count(*) FILTER (WHERE twitter_handle IS NOT NULL)          AS twitter_handle,
  count(*) FILTER (WHERE crunchbase_url IS NOT NULL)          AS crunchbase_url,
  count(*) FILTER (WHERE angellist_url IS NOT NULL)           AS angellist_url,
  count(*) FILTER (WHERE website_url IS NOT NULL)             AS website_url,
  count(*) FILTER (WHERE past_investments IS NOT NULL)        AS past_investments,
  count(*) FILTER (WHERE bio_summary IS NOT NULL)             AS bio_summary,
  count(*) FILTER (WHERE city IS NOT NULL)                    AS city,
  count(*) FILTER (WHERE country IS NOT NULL)                 AS country,
  count(*) FILTER (WHERE prior_company IS NOT NULL)           AS prior_company,
  count(*) FILTER (WHERE mutual_connections IS NOT NULL)      AS mutual_connections,
  count(*) FILTER (WHERE personal_thesis_notes IS NOT NULL)   AS personal_thesis_notes,
  count(*) FILTER (WHERE interests IS NOT NULL)               AS interests
FROM investors;

\echo '── investors: relationship-state fields (will move to leads) ──'
SELECT
  count(*) FILTER (WHERE warmth_score IS NOT NULL)            AS warmth_score,
  count(*) FILTER (WHERE intro_path IS NOT NULL)              AS intro_path,
  count(*) FILTER (WHERE last_contact_at IS NOT NULL)         AS last_contact_at,
  count(*) FILTER (WHERE next_reminder_at IS NOT NULL)        AS next_reminder_at,
  count(*) FILTER (WHERE email_verified_at IS NOT NULL)       AS email_verified_at
FROM investors;

\echo '── investors: fund-shaped fields (will drop dupes; firm owns these) ──'
SELECT
  count(*) FILTER (WHERE check_size_min_usd IS NOT NULL)      AS check_size_min_usd,
  count(*) FILTER (WHERE check_size_max_usd IS NOT NULL)      AS check_size_max_usd,
  count(*) FILTER (WHERE sector_interests IS NOT NULL AND array_length(sector_interests,1) > 0) AS sector_interests,
  count(*) FILTER (WHERE stage_interests  IS NOT NULL AND array_length(stage_interests,1)  > 0) AS stage_interests
FROM investors;

\echo '── investors: KEEP fields (contact-only, must survive) ──'
SELECT
  count(*) FILTER (WHERE first_name IS NOT NULL)              AS first_name,
  count(*) FILTER (WHERE last_name IS NOT NULL)               AS last_name,
  count(*) FILTER (WHERE title IS NOT NULL)                   AS title,
  count(*) FILTER (WHERE decision_authority IS NOT NULL)      AS decision_authority,
  count(*) FILTER (WHERE email IS NOT NULL)                   AS email,
  count(*) FILTER (WHERE mobile_e164 IS NOT NULL)             AS mobile_e164,
  count(*) FILTER (WHERE linkedin_url IS NOT NULL)            AS linkedin_url,
  count(*) FILTER (WHERE timezone IS NOT NULL)                AS timezone,
  count(*) FILTER (WHERE preferred_meeting_hours IS NOT NULL) AS preferred_meeting_hours_will_rename
FROM investors;

\echo '── leads: existing rows (target for moved fields) ──'
SELECT count(*) AS total_leads, count(*) FILTER (WHERE stage NOT IN ('funded','closed_lost')) AS active_leads FROM leads;

\echo '── leads: how many investors lack an active lead? (will need backfill) ──'
SELECT count(*) AS investors_without_active_lead
FROM investors i
WHERE NOT EXISTS (
  SELECT 1 FROM leads l
   WHERE l.investor_id = i.id
     AND l.stage NOT IN ('funded','closed_lost')
);

\echo '── firms: total rows ──'
SELECT count(*) AS total_firms FROM firms;

\echo '── interactions: distribution by kind ──'
SELECT kind, count(*) AS n FROM interactions GROUP BY kind ORDER BY n DESC;

\echo '── documents: total + per-kind ──'
SELECT count(*) AS total_documents FROM documents WHERE deleted_at IS NULL;
SELECT kind, count(*) AS n FROM documents WHERE deleted_at IS NULL GROUP BY kind ORDER BY n DESC;

\echo '── ndas + meetings + email_outbox snapshot ──'
SELECT 'ndas' AS tbl, count(*)::int AS n FROM ndas
UNION ALL SELECT 'meetings', count(*)::int FROM meetings
UNION ALL SELECT 'email_outbox', count(*)::int FROM email_outbox
UNION ALL SELECT 'email_inbox', count(*)::int FROM email_inbox;
