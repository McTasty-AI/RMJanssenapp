-- Add 'cursus' to the day_status enum
-- This allows users to mark days as course days, which count as 8 hours but not as worked days for clients

ALTER TYPE day_status ADD VALUE IF NOT EXISTS 'cursus';


