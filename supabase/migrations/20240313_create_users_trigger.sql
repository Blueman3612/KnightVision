-- Create the public.users table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  full_name TEXT,
  elo_rating INTEGER DEFAULT 1200,
  games_played INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security for the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to select only their own user data
DROP POLICY IF EXISTS "Users can view their own user data" ON public.users;
CREATE POLICY "Users can view their own user data" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

-- Create policy to allow users to update only their own user data
DROP POLICY IF EXISTS "Users can update their own user data" ON public.users;
CREATE POLICY "Users can update their own user data" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id);

-- Function to handle new user creation
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

-- Trigger to automatically insert new users into public.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users (this will run one time when the migration is applied)
INSERT INTO public.users (id, email, full_name, created_at)
SELECT id, email, raw_user_meta_data->>'full_name', created_at 
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name; 