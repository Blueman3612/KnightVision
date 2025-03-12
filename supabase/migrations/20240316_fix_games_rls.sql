-- Drop existing policies for the games table to start fresh
DROP POLICY IF EXISTS "Users can view their own games" ON public.games;
DROP POLICY IF EXISTS "Users can insert their own games" ON public.games;
DROP POLICY IF EXISTS "Users can update their own games" ON public.games;
DROP POLICY IF EXISTS "Users can delete their own games" ON public.games;

-- Enable RLS for the games table if not already enabled
ALTER TABLE IF EXISTS public.games ENABLE ROW LEVEL SECURITY;

-- Create a policy for users to select their own games
CREATE POLICY "Users can view their own games" 
ON public.games 
FOR SELECT 
USING (auth.uid()::text = user_id::text);

-- Create a policy for users to insert their own games
CREATE POLICY "Users can insert their own games" 
ON public.games 
FOR INSERT 
WITH CHECK (auth.uid()::text = user_id::text);

-- Create a policy for users to update their own games
CREATE POLICY "Users can update their own games" 
ON public.games 
FOR UPDATE 
USING (auth.uid()::text = user_id::text);

-- Create a policy for users to delete their own games
CREATE POLICY "Users can delete their own games" 
ON public.games 
FOR DELETE 
USING (auth.uid()::text = user_id::text);

-- For debugging: Log all session variables
SELECT 
  current_setting('role'),
  current_setting('request.jwt.claims', true) as jwt_claims; 