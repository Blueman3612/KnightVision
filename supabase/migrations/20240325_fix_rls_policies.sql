-- Drop existing policies and create more permissive ones
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;

DROP POLICY IF EXISTS "Users can view own games" ON public.games;
DROP POLICY IF EXISTS "Users can insert own games" ON public.games;
DROP POLICY IF EXISTS "Users can update own games" ON public.games;
DROP POLICY IF EXISTS "Users can delete own games" ON public.games;

-- Create permissive policies for the users table
-- Allow any authenticated user to select users (or allow via session check)
CREATE POLICY "Users select policy" 
ON public.users 
FOR SELECT 
USING (true);  -- Allow all selects on users table

-- Allow updating own user record - uses session user check
CREATE POLICY "Users update policy" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id OR auth.uid() IS NULL);  -- More permissive, allows when auth is null

-- Allow inserting with user ID in JWT or any user when developing
CREATE POLICY "Users insert policy" 
ON public.users 
FOR INSERT 
WITH CHECK (auth.uid() = id OR auth.uid() IS NULL);  -- More permissive, allows when auth is null

-- Create permissive policies for the games table
-- Allow selecting all games (development mode)
CREATE POLICY "Games select policy" 
ON public.games 
FOR SELECT 
USING (true);  -- Allow all selects on games table

-- Allow inserting games if user_id matches JWT or for any user in development
CREATE POLICY "Games insert policy" 
ON public.games 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);  -- More permissive

-- Allow updating own games
CREATE POLICY "Games update policy" 
ON public.games 
FOR UPDATE 
USING (auth.uid() = user_id OR auth.uid() IS NULL);

-- Allow deleting own games
CREATE POLICY "Games delete policy" 
ON public.games 
FOR DELETE 
USING (auth.uid() = user_id OR auth.uid() IS NULL);

-- Update the check_tables_info function to show auth status
CREATE OR REPLACE FUNCTION public.check_tables_info()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- This bypasses RLS
AS $$
DECLARE
    result json;
    auth_status text;
BEGIN
    -- Check if auth.uid() is null and provide helpful message
    IF auth.uid() IS NULL THEN
        auth_status := 'Not authenticated (using permissive policies)';
    ELSE
        auth_status := auth.uid();
    END IF;

    SELECT json_build_object(
        'users_count', (SELECT count(*) FROM public.users),
        'games_count', (SELECT count(*) FROM public.games),
        'current_user', current_user,
        'current_role', current_role,
        'auth_uid', auth_status,
        'rls_enabled', true,
        'using_permissive_policy', auth.uid() IS NULL
    ) INTO result;
    
    RETURN result;
END;
$$; 