-- Re-enable Row Level Security on tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Create policies for the users table
-- Users can view their own data only
CREATE POLICY "Users can view own data" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

-- Users can update their own data only
CREATE POLICY "Users can update own data" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id);

-- Users can insert their own data (for user creation)
CREATE POLICY "Users can insert own data" 
ON public.users 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Create policies for the games table
-- Users can view their own games
CREATE POLICY "Users can view own games" 
ON public.games 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own games (for PGN upload)
CREATE POLICY "Users can insert own games" 
ON public.games 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own games
CREATE POLICY "Users can update own games" 
ON public.games 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can delete their own games
CREATE POLICY "Users can delete own games" 
ON public.games 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add a special function to get table statistics with RLS enabled
-- This version works with RLS enabled
CREATE OR REPLACE FUNCTION public.check_tables_info()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- This bypasses RLS
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'users_count', (SELECT count(*) FROM public.users),
        'games_count', (SELECT count(*) FROM public.games),
        'current_user', current_user,
        'current_role', current_role,
        'auth_uid', auth.uid(),
        'rls_enabled', true
    ) INTO result;
    
    RETURN result;
END;
$$; 