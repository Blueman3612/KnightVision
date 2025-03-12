import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import supabase from '../lib/supabase';
import Layout from '../components/Layout';

const Profile = () => {
  const router = useRouter();
  const session = useSession();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userData, setUserData] = useState<any>(null);
  const [tableStatus, setTableStatus] = useState<any>(null);
  
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
      checkTablesStatus();
    }
  }, [session]);

  // Get database table information via secure RPC function
  const checkTablesStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('check_tables_info');
      
      if (error) {
        console.error('Error checking tables info:', error);
      } else {
        console.log('Tables info:', data);
        setTableStatus(data);
      }
    } catch (err) {
      console.error('Error checking tables info:', err);
    }
  };

  // Fetch user data - protected by RLS policies
  const fetchUserData = async () => {
    if (!session?.user?.id) {
      console.error('No user ID available');
      return;
    }

    try {
      console.log('Fetching user data for ID:', session.user.id);
      
      // Direct table query - RLS is disabled so this should work
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
      if (error) {
        console.error('Error fetching user data:', error);
        
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
        console.log('User data loaded:', data);
      }
    } catch (err) {
      console.error('Error fetching user:', err);
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
      console.log('Creating user record for:', session.user.email);
      
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
        console.error('Error creating user:', error);
        setMessage({
          text: `Failed to create user: ${error.message}`,
          type: 'error'
        });
        return null;
      }
      
      console.log('User created successfully:', data);
      setUserData(data);
      setMessage({
        text: 'User profile created successfully',
        type: 'success'
      });
      return data;
    } catch (err) {
      console.error('Error creating user:', err);
      return null;
    }
  };

  // Test the database connection with RLS policies
  const testDatabaseConnection = async () => {
    if (!session) {
      setMessage({
        text: 'You need to be logged in to test the database connection.',
        type: 'error'
      });
      return;
    }
    
    setLoading(true);
    setMessage({ text: 'Testing database connection...', type: 'info' });
    
    try {
      // Game insertion - protected by RLS policies
      const { data, error } = await supabase
        .from('games')
        .insert([{
          user_id: session.user.id,
          pgn: `[Event "Test Game Direct Insert"]
[Site "Test Site"]
[Date "2023.01.01"]
[Round "1"]
[White "Test White"]
[Black "Test Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 1-0`,
          result: '1-0',
          analyzed: false
        }])
        .select();
        
      if (error) {
        console.error('Database test failed:', error);
        setMessage({
          text: `Database test failed: ${error.message}`,
          type: 'error'
        });
      } else {
        console.log('Game inserted successfully:', data);
        setMessage({
          text: 'Database connection test successful! Game inserted.',
          type: 'success'
        });
      }
    } catch (err) {
      console.error('Test error:', err);
      setMessage({
        text: `Test failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle PGN file upload - protected by RLS policies
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!session?.user?.id) {
      setMessage({ 
        text: 'You need to be logged in to upload files',
        type: 'error'
      });
      return;
    }

    setLoading(true);
    setMessage({ text: 'Processing PGN file...', type: 'info' });
    setUploadProgress(0);

    try {
      const file = files[0];
      const text = await file.text();
      
      // Parse the PGN file
      const games = parsePgn(text);
      
      if (games.length === 0) {
        setMessage({ text: 'No valid games found in the PGN file', type: 'error' });
        setLoading(false);
        return;
      }
      
      setMessage({ text: `Found ${games.length} games. Uploading...`, type: 'info' });
      
      let successCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      
      // Upload each game to Supabase
      for (let i = 0; i < games.length; i++) {
        const game = games[i];
        try {
          // Check if game already exists
          const { data: existingGames } = await supabase
            .from('games')
            .select('id')
            .eq('pgn', game.pgn)
            .limit(1);
            
          if (existingGames && existingGames.length > 0) {
            duplicateCount++;
          } else {
            // Insert game - protected by RLS policies
            const { error } = await supabase
              .from('games')
              .insert([{
                user_id: session.user.id,
                pgn: game.pgn,
                result: game.result,
                analyzed: false
              }]);
              
            if (error) {
              console.error('Error uploading game:', error);
              errorCount++;
            } else {
              successCount++;
            }
          }
        } catch (err) {
          console.error('Error processing game:', err);
          errorCount++;
        }
        
        // Update progress
        setUploadProgress(Math.round(((i + 1) / games.length) * 100));
      }
      
      // Show results
      setMessage({ 
        text: `Upload complete: ${successCount} games uploaded, ${duplicateCount} duplicates skipped, ${errorCount} errors`,
        type: errorCount > 0 ? 'error' : 'success'
      });
    } catch (err) {
      console.error('Error processing PGN file:', err);
      setMessage({ text: 'Error processing PGN file: ' + (err as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Parse PGN string into array of game objects
  const parsePgn = (pgnText: string): { pgn: string, result: string }[] => {
    const games: { pgn: string, result: string }[] = [];
    
    // Split the PGN into individual games (a PGN file may contain multiple games)
    // Split on the "[Event" tag that typically starts a new game
    const gameTexts = pgnText.split(/(?=\[Event)/);
    
    for (const gameText of gameTexts) {
      if (!gameText.trim()) continue;
      
      // Basic validation - must have some tags and moves
      if (!gameText.includes('[') || !gameText.includes(']')) continue;
      
      // Extract the result
      const resultMatch = gameText.match(/\[Result "([^"]+)"\]/);
      const result = resultMatch ? resultMatch[1] : '?';
      
      games.push({
        pgn: gameText.trim(),
        result
      });
    }
    
    return games;
  };

  if (!session) {
    return <div>Redirecting to login...</div>;
  }

  return (
    <Layout>
      <Head>
        <title>Chess Tutor - Profile</title>
        <meta name="description" content="Chess Tutor Profile Page" />
      </Head>
      
      <div className="container mx-auto px-4 py-8 w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-white">Your Profile</h1>
        
        {userData && (
          <div className="bg-gray-800 shadow-lg rounded-lg p-6 mb-8 text-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-white">User Information</h2>
            <div className="mb-4">
              <p><span className="font-semibold">Email:</span> {userData.email}</p>
              <p><span className="font-semibold">Name:</span> {userData.full_name || 'Not set'}</p>
              <p><span className="font-semibold">ELO Rating:</span> {userData.elo_rating}</p>
              <p><span className="font-semibold">Games Played:</span> {userData.games_played}</p>
              <p><span className="font-semibold">User ID:</span> {userData.id}</p>
            </div>
          </div>
        )}
        
        {/* Status panel showing database information and RLS status */}
        {tableStatus && (
          <div className="bg-gray-800 shadow-lg rounded-lg p-6 mb-8 text-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-white">Database Info</h2>
            <div className="mb-4">
              <p><span className="font-semibold">Users Count:</span> {tableStatus.users_count}</p>
              <p><span className="font-semibold">Games Count:</span> {tableStatus.games_count}</p>
              <p><span className="font-semibold">Database User:</span> {tableStatus.current_user}</p>
              <p><span className="font-semibold">Role:</span> {tableStatus.current_role}</p>
              <p><span className="font-semibold">Auth UID:</span> {tableStatus.auth_uid || 'Not authenticated'}</p>
              <p>
                <span className="font-semibold">RLS Status:</span> 
                <span className={tableStatus.rls_enabled ? "text-green-400 ml-1" : "text-red-400 ml-1"}>
                  {tableStatus.rls_enabled ? "Enabled" : "Disabled"}
                </span>
                {tableStatus.using_permissive_policy && (
                  <span className="text-yellow-400 ml-2">(using permissive policies)</span>
                )}
              </p>
              <div className="mt-4">
                <button
                  onClick={checkTablesStatus}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                >
                  Refresh Info
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-gray-800 shadow-lg rounded-lg p-6 mb-8 text-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-white">Upload PGN Files</h2>
          <p className="mb-4 text-gray-300">
            Upload your chess game PGN files to analyze your strengths and weaknesses.
          </p>
          
          <div className="mb-4">
            <input 
              type="file" 
              accept=".pgn"
              onChange={handleFileUpload}
              disabled={loading}
              className="block w-full text-sm text-gray-300
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-gray-700 file:text-gray-200
                hover:file:bg-gray-600"
            />
          </div>
          
          <div className="my-4">
            <button
              onClick={testDatabaseConnection}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Test Database Connection
            </button>
            <p className="text-xs text-gray-400 mt-1">
              Click to test if you can upload games to the database
            </p>
          </div>
          
          {loading && (
            <div className="mb-4">
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-blue-500 h-2.5 rounded-full" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Uploading: {uploadProgress}%
              </p>
            </div>
          )}
          
          {message && (
            <div className={`p-4 mb-4 rounded-md ${
              message.type === 'success' ? 'bg-green-900 bg-opacity-50 text-green-200' :
              message.type === 'error' ? 'bg-red-900 bg-opacity-50 text-red-200' :
              'bg-blue-900 bg-opacity-50 text-blue-200'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Profile; 