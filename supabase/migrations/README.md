# Supabase Migrations

This directory contains SQL migration files for the Chess Tutor application's Supabase database.

## Migration Naming Convention

Migrations follow the naming convention:

```
YYYYMMDD_brief_description.sql
```

For example: `20240327_add_user_color_and_aliases.sql`

## Running Migrations

Migrations can be applied using the Supabase CLI:

```bash
supabase db push
```

Or by running the SQL file directly in the Supabase dashboard's SQL Editor.

## Migration Structure

Each migration should:

1. Begin with a comment describing the purpose of the migration
2. Use transactions where appropriate (`BEGIN` and `COMMIT`)
3. Include defensive coding practices like `IF EXISTS` and `IF NOT EXISTS`
4. Add proper Row Level Security (RLS) policies for any new tables

## Recent Changes

- `20240327_add_user_color_and_aliases.sql`: Added user_color column to games table and aliases array to auth.users table for player identification 