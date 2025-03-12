-- Create a function for inserting games securely
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
    
    -- Ensure the user exists
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = _uid) THEN
        RAISE EXCEPTION 'User not found in public.users';
    END IF;
    
    -- Insert the game
    INSERT INTO public.games (user_id, pgn, result, analyzed)
    VALUES (_uid::text, p_pgn, p_result, false)
    RETURNING id INTO _game_id;
    
    RETURN _game_id;
END;
$$; 