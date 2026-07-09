-- Migration: add event-level invoice recipient name
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS invoice_name TEXT;
