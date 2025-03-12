import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import supabase from '../lib/supabase';

const Profile = () => {
  const router = useRouter();
  const session = useSession();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
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
              errorCount++;
            } else {
              successCount++;
            }
          }
        } catch (err) {
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
    <>
      <Head>
        <title>Chess Tutor - Profile</title>
        <meta name="description" content="Chess Tutor Profile Page" />
      </Head>
      
      <div className="container mx-auto px-4 py-8 w-full max-w-4xl">
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
    </>
  );
};

export default Profile; 