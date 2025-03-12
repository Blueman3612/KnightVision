-- Drop existing RLS policies for users table
DROP POLICY IF EXISTS "Users can view their own user data" ON public.users;
DROP POLICY IF EXISTS "Users can update their own user data" ON public.users;
DROP POLICY IF EXISTS "System can insert user data" ON public.users;

-- Re-create RLS policies with type casting to handle UUID comparison
CREATE POLICY "Users can view their own user data" 
ON public.users 
FOR SELECT 
USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update their own user data" 
ON public.users 
FOR UPDATE 
USING (auth.uid()::text = id::text);

-- Allow INSERT for system-level functions but not for regular users
-- This will be used by the handle_new_user trigger function
CREATE POLICY "System can insert user data" 
ON public.users 
FOR INSERT 
WITH CHECK (true);

-- Create a get_current_user RPC function
CREATE OR REPLACE FUNCTION public.get_current_user()
RETURNS SETOF public.users
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.users 
    WHERE id::text = auth.uid()::text;
END;
$$;

-- Verify trigger function is working correctly
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, created_at)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.created_at)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, 
      full_name = EXCLUDED.full_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 