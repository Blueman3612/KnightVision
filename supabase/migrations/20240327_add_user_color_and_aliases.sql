-- Migration: Add user_color to games table and aliases to users table
-- Description: This migration adds a user_color column to the games table to track 
-- whether the user played as white or black. It also adds an aliases array to 
-- the users table to store player names for automatic color determination.

-- Set up migration transaction
BEGIN;

-- Add user_color column to games table with check constraint
ALTER TABLE IF EXISTS public.games 
ADD COLUMN IF NOT EXISTS user_color TEXT CHECK (user_color IN ('white', 'black'));

-- Add aliases column to users table
ALTER TABLE IF EXISTS public.users
ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';

-- Commit transaction
COMMIT; 