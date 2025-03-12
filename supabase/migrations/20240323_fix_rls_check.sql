-- Create a simplified admin function to check tables status
-- This doesn't rely on rls_enabled column which doesn't exist
CREATE OR REPLACE FUNCTION public.check_tables_info()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'users_count', (SELECT count(*) FROM public.users),
        'games_count', (SELECT count(*) FROM public.games),
        'current_user', current_user,
        'current_role', current_role,
        'auth_uid', auth.uid()
    ) INTO result;
    
    RETURN result;
END;
$$; 