-- Enable Row Level Security for the games table
ALTER TABLE IF EXISTS public.games ENABLE ROW LEVEL SECURITY;

-- Create a policy for users to select their own games
DROP POLICY IF EXISTS "Users can view their own games" ON public.games;
CREATE POLICY "Users can view their own games" 
ON public.games 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create a policy for users to insert their own games
DROP POLICY IF EXISTS "Users can insert their own games" ON public.games;
CREATE POLICY "Users can insert their own games" 
ON public.games 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create a policy for users to update their own games
DROP POLICY IF EXISTS "Users can update their own games" ON public.games;
CREATE POLICY "Users can update their own games" 
ON public.games 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create a policy for users to delete their own games
DROP POLICY IF EXISTS "Users can delete their own games" ON public.games;
CREATE POLICY "Users can delete their own games" 
ON public.games 
FOR DELETE 
USING (auth.uid() = user_id); 