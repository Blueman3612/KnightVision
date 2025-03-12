-- Update the insert_game RPC function to handle user existence more effectively
CREATE OR REPLACE FUNCTION public.insert_game(p_pgn TEXT, p_result TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _uid UUID;
    _game_id UUID;
BEGIN
    -- Get the authenticated user ID
    _uid := auth.uid();
    
    -- Directly query the user table with type casting to ensure we find the user
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id::text = _uid::text) THEN
        -- If user doesn't exist, try to create them from auth.users
        INSERT INTO public.users (id, email, created_at)
        SELECT au.id, au.email, au.created_at
        FROM auth.users au
        WHERE au.id = _uid
        ON CONFLICT (id) DO NOTHING;
        
        -- Check again if user exists after attempted creation
        IF NOT EXISTS (SELECT 1 FROM public.users WHERE id::text = _uid::text) THEN
            RAISE EXCEPTION 'User not found in public.users and could not be created';
        END IF;
    END IF;
    
    -- Insert the game
    INSERT INTO public.games (user_id, pgn, result, analyzed)
    VALUES (_uid::text, p_pgn, p_result, false)
    RETURNING id INTO _game_id;
    
    RETURN _game_id;
END;
$$; 