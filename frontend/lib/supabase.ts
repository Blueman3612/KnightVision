import { createClient } from '@supabase/supabase-js';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';

// Create a single supabase client for interacting with your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Store the original onAuthStateChange method
const originalOnAuthStateChange = supabase.auth.onAuthStateChange;

// Override with tracking version - using regular function to preserve 'this' context
supabase.auth.onAuthStateChange = function(callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>) {
  // Logging code...
  return originalOnAuthStateChange.call(this, callback);
};

export default supabase; 