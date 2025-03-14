-- Migration to update handle_new_user function to use display_name
-- This fixes the user creation and authentication flow after renaming full_name to display_name
--
-- Background:
-- We've renamed the 'full_name' column to 'display_name' in the users table for better
-- semantic accuracy. This migration updates the database trigger function to use the new
-- column name and helps prevent "Database error granting user" errors during authentication.
--
-- The error occurs because the auth.users trigger calls this function during user creation and login.

-- Update the function that handles new user creation to use display_name
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  display_name_value TEXT := NULL;
BEGIN
  -- This function is called by a trigger on auth.users table
  -- It creates/updates a corresponding record in public.users table
  
  -- Only set display_name if explicitly provided in user_metadata, otherwise keep it NULL
  -- This allows it to be set later via profile updates or PGN upload
  IF new.raw_user_meta_data->>'display_name' IS NOT NULL THEN
    display_name_value := new.raw_user_meta_data->>'display_name';
  ELSIF new.raw_user_meta_data->>'name' IS NOT NULL THEN
    display_name_value := new.raw_user_meta_data->>'name';
  END IF;
  
  INSERT INTO public.users (
    id, 
    email, 
    display_name,
    created_at
  )
  VALUES (
    new.id, 
    new.email, 
    display_name_value,
    new.created_at
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    -- Only update display_name if a new non-NULL value is provided
    display_name = CASE 
                     WHEN EXCLUDED.display_name IS NOT NULL THEN EXCLUDED.display_name 
                     ELSE public.users.display_name 
                   END;
  
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but continue the transaction to prevent auth failures
    RAISE NOTICE 'Error in handle_new_user: %', SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to ensure it's properly connected to the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant appropriate permissions to ensure the function can be executed
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon; 