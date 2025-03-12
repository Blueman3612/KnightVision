import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import supabase from '../lib/supabase';

// Define a more comprehensive game type
interface ChessGame {
  pgn: string;
  result: string;
  event?: string;
  site?: string;
  gameDate?: string;
  round?: string;
  whitePlayer?: string;
  blackPlayer?: string;
  whiteElo?: number;
  blackElo?: number;
  eco?: string;
  timeControl?: string;
  termination?: string;
  gameLink?: string;
  movesOnly?: string;
  endTime?: string;
  startTime?: string;
  platform?: string;
  uniqueGameId: string;
}

const Profile = () => {
  const router = useRouter();
  const session = useSession();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userData, setUserData] = useState<any>(null);
  const [parsingMetrics, setParsingMetrics] = useState<{
    totalGames: number;
    parsingTime: number;
    gamesPerSecond: number;
    fileSize: number;
  } | null>(null);
  
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

  // Enhanced file upload with batched processing
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
    setParsingMetrics(null);

    try {
      const file = files[0];
      const fileSize = file.size;
      const text = await file.text();
      
      // Start measuring parsing time
      const parsingStartTime = performance.now();
      
      // Parse all games at once
      const games = parsePgn(text);
      
      const parsingEndTime = performance.now();
      const parsingTimeMs = parsingEndTime - parsingStartTime;
      
      console.log(`Total games found in PGN: ${games.length}`);
      
      if (games.length === 0) {
        setMessage({ text: 'No valid games found in the PGN file', type: 'error' });
        setLoading(false);
        return;
      }
      
      setMessage({ text: `Found ${games.length} games. Checking for duplicates...`, type: 'info' });
      
      // Start measuring processing time
      const processingStartTime = performance.now();
      
      // Extract all unique game IDs for batch duplicate checking
      const uniqueGameIds = games.map(game => game.uniqueGameId);
      
      // Batch size for checking duplicates (PostgreSQL IN clause has limits)
      const duplicateCheckBatchSize = 50;
      const existingGameIds = new Set<string>();
      
      // Check for duplicates in batches to avoid IN clause limitations
      for (let i = 0; i < uniqueGameIds.length; i += duplicateCheckBatchSize) {
        const idBatch = uniqueGameIds.slice(i, i + duplicateCheckBatchSize);
        
        const { data: existingGames, error: queryError } = await supabase
          .from('games')
          .select('unique_game_id')
          .eq('user_id', session.user.id)
          .in('unique_game_id', idBatch);
          
        if (queryError) {
          console.error('Error in duplicate batch check:', queryError);
          continue; // Continue with other batches even if one fails
        }
        
        // Add found existing games to our set
        existingGames?.forEach(game => {
          if (game.unique_game_id) {
            existingGameIds.add(game.unique_game_id);
          }
        });
      }
      
      // Filter out duplicates using our accumulated set of existing IDs
      const newGames = games.filter(game => !existingGameIds.has(game.uniqueGameId));
      const duplicateCount = games.length - newGames.length;
      
      console.log(`After duplicate checking - New games: ${newGames.length}, Duplicates: ${duplicateCount}`);
      setMessage({ text: `Found ${newGames.length} new games. Uploading in batches...`, type: 'info' });
      
      // Prepare games for insertion
      const gamesToInsert = newGames.map(game => ({
        user_id: session.user.id,
        pgn: game.pgn,
        result: game.result,
        event: game.event,
        site: game.site,
        game_date: game.gameDate,
        round: game.round,
        white_player: game.whitePlayer,
        black_player: game.blackPlayer,
        white_elo: game.whiteElo,
        black_elo: game.blackElo,
        eco: game.eco,
        time_control: game.timeControl,
        termination: game.termination,
        game_link: game.gameLink,
        moves_only: game.movesOnly,
        platform: game.platform,
        unique_game_id: game.uniqueGameId,
        analyzed: false
      }));
      
      // Process in batches of 50 to stay within limits
      const insertBatchSize = 50;
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < gamesToInsert.length; i += insertBatchSize) {
        const batch = gamesToInsert.slice(i, i + insertBatchSize);
        
        // Remove problematic timestamp fields from each game object in the batch
        const cleanedBatch = batch.map(game => {
          // Create a shallow copy of the game object to avoid modifying the original
          const gameClone = { ...game };
          
          // Delete potential timestamp fields if they exist
          // Using delete operator to safely remove properties that might not exist
          delete (gameClone as any).end_time;
          delete (gameClone as any).start_time;
          
          return gameClone;
        });
        
        // Log the first game for debugging
        if (i === 0) {
          console.log("Sample game data:", cleanedBatch[0]);
        }
        
        const { error: insertError, data: insertedData } = await supabase
          .from('games')
          .insert(cleanedBatch);
          
        if (insertError) {
          errorCount += batch.length;
          console.error('Error inserting batch:', insertError);
        } else {
          successCount += batch.length;
          console.log(`Inserted batch ${i/insertBatchSize + 1}/${Math.ceil(gamesToInsert.length/insertBatchSize)}: ${batch.length} games`);
        }
        
        // Update progress - based on all games to insert, not just current batch
        setUploadProgress(Math.round(((i + batch.length) / gamesToInsert.length) * 100));
      }
      
      // Calculate final metrics
      const processingEndTime = performance.now();
      const totalProcessingTimeMs = processingEndTime - processingStartTime;
      const totalProcessingTimeSec = totalProcessingTimeMs / 1000;
      const totalGamesProcessed = games.length;
      const gamesPerSecond = totalGamesProcessed / totalProcessingTimeSec;
      
      setParsingMetrics({
        totalGames: games.length,  // This will now correctly show all 1100+ games
        parsingTime: totalProcessingTimeMs,
        gamesPerSecond: gamesPerSecond,
        fileSize: fileSize
      });
      
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

  // Enhanced PGN parser that extracts all metadata
  const parsePgn = (pgnText: string): ChessGame[] => {
    const games: ChessGame[] = [];
    
    // Split the PGN into individual games (a PGN file may contain multiple games)
    // Split on the "[Event" tag that typically starts a new game
    const gameTexts = pgnText.split(/(?=\[Event)/);
    
    for (const gameText of gameTexts) {
      if (!gameText.trim()) continue;
      
      // Basic validation - must have some tags and moves
      if (!gameText.includes('[') || !gameText.includes(']')) continue;
      
      // Extract all header tags
      const headers: Record<string, string> = {};
      const headerMatches = Array.from(gameText.matchAll(/\[([\w]+)\s+"([^"]*)"\]/g));
      
      for (const match of headerMatches) {
        if (match[1] && match[2] !== undefined) {
          headers[match[1]] = match[2];
        }
      }
      
      // Extract the moves part (everything after the last header)
      const lastHeaderIndex = gameText.lastIndexOf(']') + 1;
      const movesOnly = gameText.substring(lastHeaderIndex).trim();
      
      // Determine platform based on Site tag
      let platform = 'Unknown';
      if (headers.Site) {
        if (headers.Site.includes('chess.com')) platform = 'Chess.com';
        else if (headers.Site.includes('lichess')) platform = 'Lichess';
        else platform = headers.Site.split(' ')[0]; // Take first word as platform
      }
      
      // Parse numeric values
      const whiteElo = headers.WhiteElo ? parseInt(headers.WhiteElo) || undefined : undefined;
      const blackElo = headers.BlackElo ? parseInt(headers.BlackElo) || undefined : undefined;
      
      // Process timestamp strings - attempt to convert them to ISO format or null
      let endTimeISO: string | undefined = undefined;
      let startTimeISO: string | undefined = undefined;
      
      if (headers.EndTime) {
        try {
          // For Chess.com format like "8:02:26 PDT"
          // We'll store just the description for now as we can't convert without a date
          endTimeISO = headers.EndTime;
        } catch (e) {
          console.warn("Could not parse EndTime:", headers.EndTime);
        }
      }
      
      if (headers.StartTime) {
        try {
          // Similarly for StartTime
          startTimeISO = headers.StartTime;
        } catch (e) {
          console.warn("Could not parse StartTime:", headers.StartTime);
        }
      }
      
      // Create unique game ID
      const uniqueComponents = [
        headers.Event || '',
        headers.Date || '',
        headers.White || '',
        headers.Black || '',
        headers.Round || '',
        headers.EndTime || headers.TimeControl || '',
        platform
      ].filter(Boolean);
      
      const uniqueGameId = uniqueComponents.join('_');
      
      // Construct the game object with all extracted metadata
      games.push({
        pgn: gameText.trim(),
        result: headers.Result || '?',
        event: headers.Event,
        site: headers.Site,
        gameDate: headers.Date,
        round: headers.Round,
        whitePlayer: headers.White,
        blackPlayer: headers.Black,
        whiteElo,
        blackElo,
        eco: headers.ECO,
        timeControl: headers.TimeControl,
        termination: headers.Termination,
        gameLink: headers.Site, // Use site as game link for now
        movesOnly,
        endTime: endTimeISO,
        startTime: startTimeISO,
        platform,
        uniqueGameId
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
          
          {parsingMetrics && (
            <div className="mb-4 p-4 bg-gray-700 rounded-md text-gray-200">
              <h3 className="text-lg font-semibold mb-2">PGN Parsing Metrics</h3>
              <ul className="space-y-1 text-sm">
                <li>File size: {(parsingMetrics.fileSize / 1024).toFixed(2)} KB</li>
                <li>Total games: {parsingMetrics.totalGames}</li>
                <li>Processing time: {(parsingMetrics.parsingTime / 1000).toFixed(2)} seconds</li>
                <li>Performance: <span className="font-bold text-green-400">{parsingMetrics.gamesPerSecond.toFixed(2)} games/second</span></li>
              </ul>
            </div>
          )}
          
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