-- Create a more comprehensive auth debug function
CREATE OR REPLACE FUNCTION public.debug_auth_anon()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    result json;
BEGIN
    -- Get information about the current connection and settings
    SELECT json_build_object(
        'session_user', current_user,
        'current_role', current_role,
        'current_setting_role', current_setting('role'),
        'is_authenticated', (SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())),
        'auth_uid', auth.uid(),
        'auth_role', coalesce(current_setting('request.jwt.claim.role', true), 'none'),
        'request_path', current_setting('request.path', true),
        'request_method', current_setting('request.method', true),
        'public_users_count', (SELECT count(*) FROM public.users),
        'auth_users_count', (SELECT count(*) FROM auth.users)
    ) INTO result;
    
    RETURN result;
END;
$$;

-- Create a debug function that checks if users exist with provided credentials
CREATE OR REPLACE FUNCTION public.verify_user_exists(user_email TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_exists BOOLEAN;
    auth_user_data json;
    public_user_data json;
    role_name TEXT;
BEGIN
    -- Check if user exists in auth.users
    SELECT EXISTS (
        SELECT 1 FROM auth.users WHERE email = user_email
    ) INTO user_exists;
    
    -- Get auth user data
    SELECT json_build_object(
        'id', id,
        'email', email,
        'role', COALESCE(raw_user_meta_data->>'role', 'standard'),
        'created_at', created_at,
        'confirmed_at', confirmed_at
    )
    FROM auth.users
    WHERE email = user_email
    INTO auth_user_data;
    
    -- Get public user data
    SELECT json_build_object(
        'id', id,
        'email', email,
        'full_name', full_name,
        'elo_rating', elo_rating,
        'games_played', games_played,
        'created_at', created_at
    )
    FROM public.users
    WHERE email = user_email
    INTO public_user_data;
    
    RETURN json_build_object(
        'user_exists', user_exists,
        'auth_user', auth_user_data,
        'public_user', public_user_data
    );
END;
$$; 