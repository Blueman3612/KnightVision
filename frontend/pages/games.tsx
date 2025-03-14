import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import supabase from '../lib/supabase';
import { Button, TextInput, Modal } from '../components/ui';

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
  user_color?: 'white' | 'black';
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
  
  // User aliases and player confirmation state
  const [userAliases, setUserAliases] = useState<string[]>([]);
  const [pendingGames, setPendingGames] = useState<ChessGame[]>([]);
  const [currentGameIndex, setCurrentGameIndex] = useState<number>(-1);
  const [showPlayerConfirmation, setShowPlayerConfirmation] = useState(false);
  
  // Add a ref for the file input with proper typing
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      router.push('/login');
    } else {
      fetchGameCount();
      fetchUserAliases();
    }
  }, [session, router]);

  // Fetch user aliases from the database
  const fetchUserAliases = async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('aliases')
        .eq('id', session.user.id)
        .single();
        
      if (error) {
        console.error('Error fetching user aliases:', error);
        // If aliases column is missing or empty, set to empty array
        setUserAliases([]);
      } else if (data) {
        setUserAliases(data.aliases || []);
      }
    } catch (err) {
      console.error('Error with user aliases:', err);
    }
  };

  // Update user aliases in the database
  const updateUserAliases = async (newAlias: string) => {
    if (!session?.user?.id || !newAlias.trim()) return;

    // Don't add if already exists
    if (userAliases.includes(newAlias)) return;

    const updatedAliases = [...userAliases, newAlias];
    
    try {
      const { error } = await supabase
        .from('users')
        .update({ aliases: updatedAliases })
        .eq('id', session.user.id);
        
      if (error) {
        console.error('Error updating user aliases:', error);
      } else {
        setUserAliases(updatedAliases);
      }
    } catch (err) {
      console.error('Error with updating aliases:', err);
    }
  };

  // Update user aliases in the database (separate from state update)
  const updateUserAliasesInDb = async (newAlias: string) => {
    if (!session?.user?.id || !newAlias.trim()) return;

    // Don't add if already exists
    if (userAliases.includes(newAlias)) return;

    const updatedAliases = [...userAliases, newAlias];
    
    try {
      // First, check if the user's display_name is NULL
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', session.user.id)
        .single();
        
      if (fetchError) {
        console.error('Error fetching user data:', fetchError);
      }
      
      // If display_name is NULL or empty, set it to this first alias
      if (!userData?.display_name) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            aliases: updatedAliases,
            display_name: newAlias 
          })
          .eq('id', session.user.id);
          
        if (updateError) {
          console.error('Error updating user aliases and display name:', updateError);
        }
      } else {
        // Otherwise just update the aliases
        const { error: updateError } = await supabase
          .from('users')
          .update({ aliases: updatedAliases })
          .eq('id', session.user.id);
          
        if (updateError) {
          console.error('Error updating user aliases:', updateError);
        }
      }
    } catch (err) {
      console.error('Error with updating aliases:', err);
    }
  };

  // Determine user color based on player names and aliases
  const determineUserColor = (game: ChessGame, aliasesOverride?: string[]): 'white' | 'black' | null => {
    if (!game.whitePlayer && !game.blackPlayer) return null;
    
    // Use provided aliases or fall back to state
    const aliases = aliasesOverride || userAliases;
    
    // Check if either player matches any alias
    if (game.whitePlayer && aliases.some(alias => 
      game.whitePlayer!.toLowerCase() === alias.toLowerCase())) {
      return 'white';
    }
    
    if (game.blackPlayer && aliases.some(alias => 
      game.blackPlayer!.toLowerCase() === alias.toLowerCase())) {
      return 'black';
    }
    
    return null; // No match found
  };

  // Process games after confirmation
  const processConfirmedGames = async () => {
    if (!session?.user?.id || pendingGames.length === 0) return;
    
    setLoading(true);
    setMessage({ text: 'Uploading confirmed games...', type: 'info' });
    
    try {
      // Prepare games for insertion
      const gamesToInsert = pendingGames.map(game => prepareGameForInsert(game, session.user.id));
      
      // Process in batches of 50 to stay within limits
      const batchSize = 50;
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < gamesToInsert.length; i += batchSize) {
        const batch = gamesToInsert.slice(i, i + batchSize);
        
        const { error: insertError } = await supabase
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
      
      setMessage({ 
        text: `Upload complete: ${successCount} games uploaded, ${errorCount} errors`,
        type: errorCount > 0 ? 'error' : 'success'
      });
      
      // Reset state
      setPendingGames([]);
      setCurrentGameIndex(-1);
      setShowPlayerConfirmation(false);
      
      // Update game count after successful upload
      fetchGameCount();
    } catch (err) {
      setMessage({ text: 'Error uploading games: ' + (err as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle player confirmation
  const confirmPlayerColor = (color: 'white' | 'black') => {
    if (currentGameIndex < 0 || currentGameIndex >= pendingGames.length) return;
    
    // Update the current game with the selected color
    const updatedGames = [...pendingGames];
    const currentGame = updatedGames[currentGameIndex];
    currentGame.user_color = color;
    
    // Add the player name to aliases
    const playerName = color === 'white' ? currentGame.whitePlayer : currentGame.blackPlayer;
    if (playerName) {
      // Update local state immediately to use for reassessment
      const newAliases = [...userAliases, playerName];
      setUserAliases(newAliases);
      
      // Save to database (async)
      updateUserAliasesInDb(playerName);
      
      // Reassess all remaining games with the new alias
      for (let i = 0; i < updatedGames.length; i++) {
        const game = updatedGames[i];
        if (!game.user_color) {
          // We have to check two scenarios - either:
          // 1. The player's username appears in the game and we just added it as an alias
          // 2. Some other alias already matched a player in this game

          // First check the new alias
          if ((game.whitePlayer?.toLowerCase() === playerName.toLowerCase()) && color === 'white') {
            game.user_color = 'white';
          } else if ((game.blackPlayer?.toLowerCase() === playerName.toLowerCase()) && color === 'black') {
            game.user_color = 'black';
          } else {
            // Try to match with any existing alias
            const computedColor = determineUserColor(game, newAliases);
            if (computedColor) {
              game.user_color = computedColor;
            }
          }
        }
      }
    }
    
    // Move to the next unconfirmed game
    setPendingGames(updatedGames);
    findNextUnconfirmedGame(updatedGames, 0); // Start from beginning to ensure we don't miss any
  };

  // Find the next game that needs confirmation
  const findNextUnconfirmedGame = (games: ChessGame[], startIndex: number) => {
    for (let i = startIndex; i < games.length; i++) {
      if (!games[i].user_color) {
        setCurrentGameIndex(i);
        setShowPlayerConfirmation(true);
        return;
      }
    }
    
    // No more games to confirm, process all games
    setCurrentGameIndex(-1);
    setShowPlayerConfirmation(false);
    processConfirmedGames();
  };

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
      user_color: game.user_color,
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
        
        if (newGames.length === 0) {
          setMessage({ text: `All ${duplicateCount} games are duplicates. Nothing to upload.`, type: 'info' });
          setLoading(false);
          return;
        }
        
        setMessage({ text: `Found ${newGames.length} new games. Determining player colors...`, type: 'info' });
        
        // Try to automatically determine user_color for each game
        const gamesWithColor = newGames.map(game => {
          const determinedColor = determineUserColor(game, userAliases);
          if (determinedColor) {
            return { ...game, user_color: determinedColor };
          }
          return game;
        });
        
        // Check if any games need user confirmation
        const unconfirmedGames = gamesWithColor.filter(game => !game.user_color);
        
        if (unconfirmedGames.length > 0) {
          // Some games need player confirmation
          setPendingGames(gamesWithColor);
          setMessage({ 
            text: `${unconfirmedGames.length} of ${gamesWithColor.length} games need player confirmation.`,
            type: 'info'
          });
          findNextUnconfirmedGame(gamesWithColor, 0);
        } else {
          // All games have user_color determined, proceed with upload
          setPendingGames(gamesWithColor);
          processConfirmedGames();
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
      } catch (fetchError) {
        console.error('Error during duplicate checking:', fetchError);
        setMessage({ 
          text: `Error checking for duplicates: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
          type: 'error'
        });
        setLoading(false);
      }
    } catch (err) {
      setMessage({ text: 'Error processing PGN file: ' + (err as Error).message, type: 'error' });
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
        
        if (newGames.length === 0) {
          setMessage({ text: `All ${duplicateCount} games are duplicates. Nothing to upload.`, type: 'info' });
          setLoading(false);
          return;
        }
        
        setMessage({ text: `Found ${newGames.length} new games. Determining player colors...`, type: 'info' });
        
        // Try to automatically determine user_color for each game
        const gamesWithColor = newGames.map(game => {
          const determinedColor = determineUserColor(game, userAliases);
          if (determinedColor) {
            return { ...game, user_color: determinedColor };
          }
          return game;
        });
        
        // Check if any games need user confirmation
        const unconfirmedGames = gamesWithColor.filter(game => !game.user_color);
        
        if (unconfirmedGames.length > 0) {
          // Some games need player confirmation
          setPendingGames(gamesWithColor);
          setMessage({ 
            text: `${unconfirmedGames.length} of ${gamesWithColor.length} games need player confirmation.`,
            type: 'info'
          });
          findNextUnconfirmedGame(gamesWithColor, 0);
        } else {
          // All games have user_color determined, proceed with upload
          setPendingGames(gamesWithColor);
          processConfirmedGames();
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
        
        // Clear the input after processing
        setPgnText('');
      } catch (error) {
        setMessage({ 
          text: `Error during upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'error'
        });
        setLoading(false);
      }
    } catch (err) {
      setMessage({ text: 'Error processing PGN text: ' + (err as Error).message, type: 'error' });
      setLoading(false);
    }
  };

  // Add this cancel upload function
  const cancelUpload = () => {
    // Clear all upload state
    setPendingGames([]);
    setCurrentGameIndex(-1);
    setShowPlayerConfirmation(false);
    setLoading(false); // Reset loading state so the progress bar disappears
    setUploadProgress(0); // Reset progress back to 0
    setParsingMetrics(null); // Reset parsing metrics when canceling
    setMessage({ 
      text: 'Game upload canceled', 
      type: 'info' 
    });
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
          
          {/* Progress and message displays */}
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
          
          {/* Player Confirmation Modal */}
          {showPlayerConfirmation && currentGameIndex >= 0 && currentGameIndex < pendingGames.length && (
            <Modal
              isOpen={showPlayerConfirmation}
              onClose={cancelUpload} // Allow closing, which cancels the upload
              size="md"
              title={
                <div className="flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" />
                  </svg>
                  <span>Who did you play as?</span>
                </div>
              }
              showCloseButton={true} // Show close button as well
            >
              <div className="mb-4 text-center">
                <p className="text-gray-300">
                  Please select which player you were in this game:
                </p>
              </div>
              
              <div className="mb-4 bg-gray-700 p-4 rounded-md shadow-inner">
                <div className="flex justify-between mb-2">
                  <span className="text-white font-medium">Event:</span>
                  <span className="text-gray-300">{pendingGames[currentGameIndex].event || 'Unknown'}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-white font-medium">Date:</span>
                  <span className="text-gray-300">{pendingGames[currentGameIndex].gameDate || 'Unknown'}</span>
                </div>
                <div className="flex justify-between mb-2 items-center">
                  <span className="text-white font-medium">White:</span>
                  <span className="text-gray-300 flex items-center">
                    {pendingGames[currentGameIndex].whitePlayer || 'Unknown'}
                    {pendingGames[currentGameIndex].whiteElo && (
                      <span className="ml-2 px-2 py-0.5 bg-gray-600 rounded text-xs">
                        {pendingGames[currentGameIndex].whiteElo}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between mb-2 items-center">
                  <span className="text-white font-medium">Black:</span>
                  <span className="text-gray-300 flex items-center">
                    {pendingGames[currentGameIndex].blackPlayer || 'Unknown'}
                    {pendingGames[currentGameIndex].blackElo && (
                      <span className="ml-2 px-2 py-0.5 bg-gray-600 rounded text-xs">
                        {pendingGames[currentGameIndex].blackElo}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white font-medium">Platform:</span>
                  <span className="text-gray-300">{pendingGames[currentGameIndex].platform || 'Unknown'}</span>
                </div>
              </div>
              
              <p className="text-center text-xs text-gray-400 italic mb-3">
                The alias you confirm will be remembered to automatically parse future games
              </p>

              <div className="flex justify-center space-x-4 mt-4">
                <Button
                  onClick={() => confirmPlayerColor('black')}
                  disabled={!pendingGames[currentGameIndex].blackPlayer}
                  variant="outline"
                  style={{
                    backgroundColor: "#000000",
                    color: "#FFFFFF",
                    borderColor: "#000000"
                  }}
                >
                  I played as Black
                </Button>
                
                <Button
                  onClick={() => confirmPlayerColor('white')}
                  disabled={!pendingGames[currentGameIndex].whitePlayer}
                  variant="outline"
                  style={{
                    backgroundColor: "#FFFFFF",
                    color: "#000000",
                    borderColor: "#CCCCCC"
                  }}
                >
                  I played as White
                </Button>
              </div>
            </Modal>
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

export default GamesPage;