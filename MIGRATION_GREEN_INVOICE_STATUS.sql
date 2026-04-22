-- Migration: add Green Invoice document tracking fields to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS gi_doc_id     TEXT,
  ADD COLUMN IF NOT EXISTS gi_doc_number INTEGER,
  ADD COLUMN IF NOT EXISTS gi_doc_type   INTEGER,
  ADD COLUMN IF NOT EXISTS gi_doc_date   TEXT,
  ADD COLUMN IF NOT EXISTS gi_doc_url    TEXT;
