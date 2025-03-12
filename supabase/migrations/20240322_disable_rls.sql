-- Temporarily disable RLS for testing and development
-- This should NOT be used in production

-- Disable RLS on users table
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Disable RLS on games table
ALTER TABLE public.games DISABLE ROW LEVEL SECURITY;

-- Create admin function to check tables status
CREATE OR REPLACE FUNCTION public.check_rls_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'users_table_has_rls', (SELECT rls_enabled FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'),
        'games_table_has_rls', (SELECT rls_enabled FROM pg_tables WHERE schemaname = 'public' AND tablename = 'games'),
        'users_count', (SELECT count(*) FROM public.users),
        'games_count', (SELECT count(*) FROM public.games)
    ) INTO result;
    
    RETURN result;
END;
$$; 