import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import supabase from '../lib/supabase';
import { Button, TextInput } from '../components/ui';

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

const GamesPage = () => {
  const router = useRouter();
  const session = useSession();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsingMetrics, setParsingMetrics] = useState<{
    totalGames: number;
    parsingTime: number;
    gamesPerSecond: number;
    fileSize: number;
  } | null>(null);
  const [pgnText, setPgnText] = useState('');
  const [gameCount, setGameCount] = useState<number | null>(null);
  
  // Add a ref for the file input with proper typing
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      router.push('/login');
    } else {
      fetchGameCount();
    }
  }, [session, router]);

  // Fetch total game count
  const fetchGameCount = async () => {
    if (!session?.user?.id) return;

    try {
      const { count, error } = await supabase
        .from('games')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
        
      if (error) {
        console.error('Error fetching game count:', error);
      } else {
        setGameCount(count);
      }
    } catch (err) {
      console.error('Error with game count:', err);
    }
  };

  // Prepare games for insertion with better field validation
  const prepareGameForInsert = (game: ChessGame, userId: string) => {
    // Start with required fields
    const gameData: Record<string, any> = {
      user_id: userId,
      pgn: game.pgn,
      analyzed: false,
      unique_game_id: game.uniqueGameId,
    };
    
    // Only add result if it's not a placeholder
    if (game.result && game.result !== '?' && game.result !== '*') {
      gameData.result = game.result;
    }
    
    // Only add fields that have valid values
    if (game.event && game.event.trim()) gameData.event = game.event;
    if (game.site && game.site.trim()) gameData.site = game.site;
    if (game.round && game.round.trim()) gameData.round = game.round;
    if (game.whitePlayer && game.whitePlayer.trim()) gameData.white_player = game.whitePlayer;
    if (game.blackPlayer && game.blackPlayer.trim()) gameData.black_player = game.blackPlayer;
    
    // Add numeric fields only if they're valid numbers
    if (game.whiteElo && !isNaN(game.whiteElo)) gameData.white_elo = game.whiteElo;
    if (game.blackElo && !isNaN(game.blackElo)) gameData.black_elo = game.blackElo;
    
    // Add other metadata if present
    if (game.eco && game.eco.trim()) gameData.eco = game.eco;
    if (game.timeControl && game.timeControl.trim()) gameData.time_control = game.timeControl;
    if (game.termination && game.termination.trim()) gameData.termination = game.termination;
    if (game.gameLink && game.gameLink.trim()) gameData.game_link = game.gameLink;
    if (game.movesOnly && game.movesOnly.trim()) gameData.moves_only = game.movesOnly;
    if (game.platform && game.platform.trim()) gameData.platform = game.platform;
    
    // Special handling for date - check for placeholders like "??"
    if (game.gameDate && game.gameDate.trim() && !game.gameDate.includes('?')) {
      // Try to parse the date to ensure it's valid
      try {
        // Standard PGN date format is YYYY.MM.DD
        const dateParts = game.gameDate.split('.');
        if (dateParts.length === 3) {
          const year = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]);
          const day = parseInt(dateParts[2]);
          
          // Basic validation - using ISO format for Postgres compatibility
          if (!isNaN(year) && !isNaN(month) && !isNaN(day) && 
              year > 1500 && year < 2100 && 
              month >= 1 && month <= 12 && 
              day >= 1 && day <= 31) {
            // Format as YYYY-MM-DD for PostgreSQL
            gameData.game_date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          }
        }
      } catch (e) {
        console.warn("Could not parse date:", game.gameDate);
        // Skip adding the date field
      }
    }
    
    return gameData;
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
      
      try {
        // Batch check for duplicates in a single query
        // Split into smaller chunks if there are too many IDs
        const maxIdsPerQuery = 100; // Supabase has limits on query size
        let existingGameIds = new Set<string>();
        
        // Process in chunks to avoid query size limitations
        for (let i = 0; i < uniqueGameIds.length; i += maxIdsPerQuery) {
          const idChunk = uniqueGameIds.slice(i, i + maxIdsPerQuery);
          
          const { data: existingGamesChunk, error: queryError } = await supabase
            .from('games')
            .select('unique_game_id')
            .eq('user_id', session.user.id)
            .in('unique_game_id', idChunk);
            
          if (queryError) {
            console.error('Error checking for duplicates:', queryError);
            // Continue anyway - we'll just assume no duplicates in this chunk
          } else if (existingGamesChunk) {
            // Add to our set of existing IDs
            existingGamesChunk.forEach(game => existingGameIds.add(game.unique_game_id));
          }
        }
        
        // Filter out duplicates
        const newGames = games.filter(game => !existingGameIds.has(game.uniqueGameId));
        const duplicateCount = games.length - newGames.length;
        
        setMessage({ text: `Found ${newGames.length} new games. Uploading in batches...`, type: 'info' });
        
        // Prepare games for insertion using our new validation function
        const gamesToInsert = newGames.map(game => prepareGameForInsert(game, session.user.id));
        
        // Process in batches of 50 to stay within limits
        const batchSize = 50;
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < gamesToInsert.length; i += batchSize) {
          const batch = gamesToInsert.slice(i, i + batchSize);
          
          // Log the first game for debugging
          if (i === 0) {
            console.log("Sample game data:", batch[0]);
          }
          
          const { error: insertError, data: insertedData } = await supabase
            .from('games')
            .insert(batch);
            
          if (insertError) {
            errorCount += batch.length;
            console.error('Error inserting batch:', insertError);
          } else {
            successCount += batch.length;
          }
          
          // Update progress
          setUploadProgress(Math.round(((i + batch.length) / gamesToInsert.length) * 100));
        }
        
        // Calculate final metrics
        const processingEndTime = performance.now();
        const totalProcessingTimeMs = processingEndTime - processingStartTime;
        const totalProcessingTimeSec = totalProcessingTimeMs / 1000;
        const totalGamesProcessed = games.length;
        const gamesPerSecond = totalGamesProcessed / totalProcessingTimeSec;
        
        setParsingMetrics({
          totalGames: games.length,
          parsingTime: totalProcessingTimeMs,
          gamesPerSecond: gamesPerSecond,
          fileSize: fileSize
        });
        
        setMessage({ 
          text: `Upload complete: ${successCount} games uploaded, ${duplicateCount} duplicates skipped, ${errorCount} errors`,
          type: errorCount > 0 ? 'error' : 'success'
        });

        // Update game count after successful upload
        fetchGameCount();
      } catch (fetchError) {
        // Handle the fetch error gracefully
        console.error('Error during duplicate checking:', fetchError);
        setMessage({ 
          text: `Error checking for duplicates. Proceeding with upload anyway.`,
          type: 'error'
        });
        
        // Continue with all games, assuming no duplicates
        const newGames = games;
        const duplicateCount = 0;
        
        setMessage({ text: `Found ${newGames.length} games. Uploading in batches...`, type: 'info' });
        
        // Prepare games for insertion using our new validation function
        const gamesToInsert = newGames.map(game => prepareGameForInsert(game, session.user.id));
        
        // Process in batches of 50 to stay within limits
        const batchSize = 50;
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < gamesToInsert.length; i += batchSize) {
          const batch = gamesToInsert.slice(i, i + batchSize);
          
          // Log the first game for debugging
          if (i === 0) {
            console.log("Sample game data:", batch[0]);
          }
          
          const { error: insertError, data: insertedData } = await supabase
            .from('games')
            .insert(batch);
            
          if (insertError) {
            errorCount += batch.length;
            console.error('Error inserting batch:', insertError);
          } else {
            successCount += batch.length;
          }
          
          // Update progress
          setUploadProgress(Math.round(((i + batch.length) / gamesToInsert.length) * 100));
        }
        
        // Calculate final metrics
        const processingEndTime = performance.now();
        const totalProcessingTimeMs = processingEndTime - processingStartTime;
        const totalProcessingTimeSec = totalProcessingTimeMs / 1000;
        const totalGamesProcessed = games.length;
        const gamesPerSecond = totalGamesProcessed / totalProcessingTimeSec;
        
        setParsingMetrics({
          totalGames: games.length,
          parsingTime: totalProcessingTimeMs,
          gamesPerSecond: gamesPerSecond,
          fileSize: fileSize
        });
        
        setMessage({ 
          text: `Upload complete: ${successCount} games uploaded, ${duplicateCount} duplicates skipped, ${errorCount} errors`,
          type: errorCount > 0 ? 'error' : 'success'
        });

        // Update game count after successful upload
        fetchGameCount();
      }
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
      
      // Create unique game ID - more robust handling of missing fields
      // Use white/black or White/Black as available
      const whitePlayer = headers.White || headers.white || '';
      const blackPlayer = headers.Black || headers.black || '';
      
      // Generate a more reliable unique ID that works across different PGN formats
      const uniqueComponents = [
        headers.Event || '',
        headers.Date || '',
        whitePlayer,
        blackPlayer,
        headers.Round || '',
        // Add a more reliable fallback for time fields
        headers.TimeControl || ''
      ]
      // Only use non-empty strings for the ID
      .filter(val => val && val.trim() !== '');
      
      // Add a fallback if we don't have enough components to make a unique ID
      let uniqueGameId = uniqueComponents.join('_');
      
      // If we don't have enough unique components, add a hash of the moves
      if (uniqueComponents.length < 3 && movesOnly) {
        uniqueGameId += '_' + simpleHash(movesOnly);
      }
      
      // Ensure we always have a unique ID even if all metadata is missing
      if (!uniqueGameId) {
        uniqueGameId = simpleHash(gameText);
      }
      
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

  // Simple hash function to create a numeric hash from a string
  const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  };

  // Function to trigger file input click 
  const handleUploadButtonClick = () => {
    // Non-null assertion operator tells TypeScript that current will not be null
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Function to process the pasted PGN text
  const handlePgnTextSubmit = async () => {
    if (!pgnText.trim()) {
      setMessage({ 
        text: 'Please enter PGN data',
        type: 'error'
      });
      return;
    }

    if (!session?.user?.id) {
      setMessage({ 
        text: 'You need to be logged in to upload games',
        type: 'error'
      });
      return;
    }

    setLoading(true);
    setMessage({ text: 'Processing PGN text...', type: 'info' });
    setUploadProgress(0);
    setParsingMetrics(null);

    try {
      // Calculate file size based on string length
      const textSize = new Blob([pgnText]).size;
      
      // Start measuring parsing time
      const parsingStartTime = performance.now();
      
      // Parse all games at once
      const games = parsePgn(pgnText);
      
      const parsingEndTime = performance.now();
      const parsingTimeMs = parsingEndTime - parsingStartTime;
      
      if (games.length === 0) {
        setMessage({ text: 'No valid games found in the PGN text', type: 'error' });
        setLoading(false);
        return;
      }
      
      setMessage({ text: `Found ${games.length} games. Checking for duplicates...`, type: 'info' });
      
      // Start measuring processing time
      const processingStartTime = performance.now();
      
      // Extract all unique game IDs for batch duplicate checking
      const uniqueGameIds = games.map(game => game.uniqueGameId);
      
      try {
        // Batch check for duplicates in a single query
        // Split into smaller chunks if there are too many IDs
        const maxIdsPerQuery = 100; // Supabase has limits on query size
        let existingGameIds = new Set<string>();
        
        // Process in chunks to avoid query size limitations
        for (let i = 0; i < uniqueGameIds.length; i += maxIdsPerQuery) {
          const idChunk = uniqueGameIds.slice(i, i + maxIdsPerQuery);
          
          const { data: existingGamesChunk, error: queryError } = await supabase
            .from('games')
            .select('unique_game_id')
            .eq('user_id', session.user.id)
            .in('unique_game_id', idChunk);
            
          if (queryError) {
            console.error('Error checking for duplicates:', queryError);
            // Continue anyway - we'll just assume no duplicates in this chunk
          } else if (existingGamesChunk) {
            // Add to our set of existing IDs
            existingGamesChunk.forEach(game => existingGameIds.add(game.unique_game_id));
          }
        }
        
        // Filter out duplicates
        const newGames = games.filter(game => !existingGameIds.has(game.uniqueGameId));
        const duplicateCount = games.length - newGames.length;
        
        setMessage({ text: `Found ${newGames.length} new games. Uploading in batches...`, type: 'info' });
        
        // Prepare games for insertion using our new validation function
        const gamesToInsert = newGames.map(game => prepareGameForInsert(game, session.user.id));
        
        // Process in batches of 50 to stay within limits
        const batchSize = 50;
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < gamesToInsert.length; i += batchSize) {
          const batch = gamesToInsert.slice(i, i + batchSize);
          
          // Log the first game for debugging
          if (i === 0) {
            console.log("Sample game data:", batch[0]);
          }
          
          const { error: insertError, data: insertedData } = await supabase
            .from('games')
            .insert(batch);
            
          if (insertError) {
            errorCount += batch.length;
            console.error('Error inserting batch:', insertError);
          } else {
            successCount += batch.length;
          }
          
          // Update progress
          setUploadProgress(Math.round(((i + batch.length) / gamesToInsert.length) * 100));
        }
        
        // Calculate final metrics
        const processingEndTime = performance.now();
        const totalProcessingTimeMs = processingEndTime - processingStartTime;
        const totalProcessingTimeSec = totalProcessingTimeMs / 1000;
        const totalGamesProcessed = games.length;
        const gamesPerSecond = totalGamesProcessed / totalProcessingTimeSec;
        
        setParsingMetrics({
          totalGames: games.length,
          parsingTime: totalProcessingTimeMs,
          gamesPerSecond: gamesPerSecond,
          fileSize: textSize
        });
        
        setMessage({ 
          text: `Upload complete: ${successCount} games uploaded, ${duplicateCount} duplicates skipped, ${errorCount} errors`,
          type: errorCount > 0 ? 'error' : 'success'
        });
        
        // Clear the input after successful upload
        setPgnText('');
        
        // Update game count after successful upload
        fetchGameCount();
      } catch (error) {
        setMessage({ 
          text: `Error during upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'error'
        });
      }
    } catch (err) {
      setMessage({ text: 'Error processing PGN text: ' + (err as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return <div>Redirecting to login...</div>;
  }

  return (
    <>
      <Head>
        <title>Chess Tutor - My Games</title>
        <meta name="description" content="Upload and manage your chess games" />
      </Head>
      
      <div className="w-full max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">My Games</h1>
          <p className="text-gray-300">
            {gameCount !== null ? `You have ${gameCount} games in your collection.` : 'Loading game data...'}
          </p>
        </div>
        
        <div className="bg-gray-800 shadow-lg rounded-lg p-6 mb-8 text-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-white">Upload Chess Games</h2>
          <p className="mb-4 text-gray-300">
            Upload your chess game PGN files to analyze your strengths and weaknesses.
          </p>
          
          <div className="mb-4">
            {/* Hidden file input */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".pgn"
              onChange={handleFileUpload}
              disabled={loading}
              className="hidden"
            />
            
            {/* Use our Button component */}
            <Button
              variant="secondary"
              size="md"
              fullWidth
              isLoading={loading}
              onClick={handleUploadButtonClick}
              leftIcon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              }
            >
              Select PGN File
            </Button>
          </div>
          
          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-gray-600"></div>
            <span className="flex-shrink mx-4 text-gray-400">OR</span>
            <div className="flex-grow border-t border-gray-600"></div>
          </div>
          
          {/* PGN Paste Area */}
          <div className="mb-4">
            <TextInput
              label="Paste PGN Data"
              placeholder="Paste your PGN data here..."
              helperText="Copy and paste PGN data from your chess platform"
              multiline
              rows={8}
              variant="filled"
              fullWidth
              value={pgnText}
              onChange={(e) => setPgnText(e.target.value)}
              disabled={loading}
              showClearButton
            />
            <div className="mt-4">
              <Button
                variant="primary"
                size="md"
                onClick={handlePgnTextSubmit}
                isLoading={loading}
                disabled={!pgnText.trim()}
                leftIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                }
              >
                Submit PGN Data
              </Button>
            </div>
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
        
        {/* Game listing section - we'll add this in the future */}
        <div className="bg-gray-800 shadow-lg rounded-lg p-6 mb-8 text-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-white">Recent Games</h2>
          <p className="text-gray-400">Game listing functionality coming soon.</p>
        </div>
      </div>
    </>
  );
};

export default GamesPage; 