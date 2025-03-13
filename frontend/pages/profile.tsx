import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import supabase from '../lib/supabase';

const Profile = () => {
  const router = useRouter();
  const session = useSession();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [userData, setUserData] = useState<any>(null);
  
  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  // Fetch user data on load
  useEffect(() => {
    if (session) {
      fetchUserData();
    }
  }, [session]);

  // Fetch user data - protected by RLS policies
  const fetchUserData = async () => {
    if (!session?.user?.id) {
      return;
    }

    try {
      // Direct table query with RLS protection
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
      if (error) {
        // Try to create user if doesn't exist
        if (error.code === 'PGRST116') { // No rows returned
          await createUser();
        } else {
          setMessage({
            text: `Error fetching user data: ${error.message}`,
            type: 'error'
          });
        }
      } else {
        setUserData(data);
      }
    } catch (err) {
      setMessage({
        text: `Error with user data: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: 'error'
      });
    }
  };
  
  // Create a user record - protected by RLS policies
  const createUser = async () => {
    if (!session?.user?.id || !session?.user?.email) return null;
    
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([{
          id: session.user.id,
          email: session.user.email,
          full_name: session.user.user_metadata?.full_name || 'New User',
          elo_rating: 1200,
          games_played: 0
        }])
        .select()
        .single();
        
      if (error) {
        setMessage({
          text: `Failed to create user: ${error.message}`,
          type: 'error'
        });
        return null;
      }
      
      setUserData(data);
      setMessage({
        text: 'User profile created successfully',
        type: 'success'
      });
      return data;
    } catch (err) {
      return null;
    }
  };

  if (!session) {
    return <div>Redirecting to login...</div>;
  }

  return (
    <>
      <Head>
        <title>Chess Tutor - Profile</title>
        <meta name="description" content="Chess Tutor Profile Page" />
      </Head>
      
      <div className="w-full max-w-4xl px-4 py-8">
        {/* User Profile Card */}
        <div className="bg-gray-800 shadow-lg rounded-lg p-6 mb-8 text-gray-100">
          <div className="flex items-start md:items-center flex-col md:flex-row">
            <div className="bg-gray-700 rounded-full p-4 mb-4 md:mb-0 md:mr-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
          </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">{userData?.full_name || 'User'}</h2>
              <p className="text-gray-400 mb-1">{session.user.email}</p>
              <p className="text-gray-400">Estimated Rating: {userData?.elo_rating || 'Not available'}</p>
            </div>
          </div>
          
          <div className="border-t border-gray-700 mt-6 pt-6">
            <h3 className="text-lg font-semibold mb-4">Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-700 bg-opacity-50 p-4 rounded-md">
                <p className="text-gray-400 text-sm">Member Since</p>
                <p className="font-medium">{userData?.created_at ? new Date(userData.created_at).toLocaleDateString() : 'Not available'}</p>
            </div>
              
              <div className="bg-gray-700 bg-opacity-50 p-4 rounded-md">
                <p className="text-gray-400 text-sm">Last Login</p>
                <p className="font-medium">{session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleDateString() : 'Not available'}</p>
              </div>
            </div>
          </div>
          
          {message && (
            <div className={`p-4 mt-4 rounded-md ${
              message.type === 'success' ? 'bg-green-900 bg-opacity-50 text-green-200' :
              message.type === 'error' ? 'bg-red-900 bg-opacity-50 text-red-200' :
              'bg-blue-900 bg-opacity-50 text-blue-200'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Profile; 