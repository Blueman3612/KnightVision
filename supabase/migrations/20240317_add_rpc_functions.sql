-- Create a function to get the current user's claims
CREATE OR REPLACE FUNCTION public.get_my_claims()
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

-- Create a function to debug the auth user
CREATE OR REPLACE FUNCTION public.debug_auth()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _uid UUID;
    _result JSONB;
BEGIN
    -- Get the authenticated user ID
    _uid := auth.uid();
    
    -- Build the result
    SELECT jsonb_build_object(
        'auth_uid', _uid,
        'auth_uid_as_text', _uid::text,
        'auth_role', current_setting('role'),
        'has_users_record', EXISTS(SELECT 1 FROM public.users WHERE id = _uid)
    ) INTO _result;
    
    RETURN _result;
END;
$$;

-- Create a convenience function for checking games table RLS
CREATE OR REPLACE FUNCTION public.check_games_rls()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _uid UUID;
    _result JSONB;
    _test_game_id UUID;
BEGIN
    -- Get the authenticated user ID
    _uid := auth.uid();
    
    -- Attempt to insert a test game
    INSERT INTO public.games (user_id, pgn, result, analyzed)
    VALUES (
        _uid::text, 
        '[Event "RLS Test Game"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0', 
        '1-0',
        false
    )
    RETURNING id INTO _test_game_id;
    
    -- Build the result
    SELECT jsonb_build_object(
        'success', _test_game_id IS NOT NULL,
        'test_game_id', _test_game_id,
        'auth_uid', _uid,
        'auth_uid_type', pg_typeof(_uid)::text,
        'games_schema', (SELECT jsonb_agg(column_name || ' ' || data_type) 
                         FROM information_schema.columns 
                         WHERE table_name = 'games' AND table_schema = 'public')
    ) INTO _result;
    
    RETURN _result;
END;
$$; 