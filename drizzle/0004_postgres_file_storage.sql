-- Migration 0004: Postgres file storage backend
-- Stores binary file content (NDA PDFs, documents) directly in Postgres bytea.
-- Used when FILE_STORAGE_DRIVER=postgres (default). R2 driver ignores this table.

CREATE TABLE IF NOT EXISTS "stored_files" (
  "storage_key"          text        PRIMARY KEY NOT NULL,
  "content_type"         text        NOT NULL,
  "size_bytes_original"  integer     NOT NULL,
  "size_bytes_compressed" integer    NOT NULL,
  "content"              bytea       NOT NULL,
  "created_at"           timestamptz NOT NULL DEFAULT now()
);
