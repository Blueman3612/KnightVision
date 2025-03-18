import React from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import supabase from '../lib/supabase';
import { gameApi } from '../lib/api';
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

// Define a database game type
interface DBChessGame {
  id: string;
  user_id: string;
  pgn: string;
  result: string;
  analyzed: boolean;
  created_at: string;
  event?: string;
  site?: string;
  game_date?: string;
  round?: string;
  white_player?: string;
  black_player?: string;
  white_elo?: number;
  black_elo?: number;
  eco?: string;
  time_control?: string;
  termination?: string;
  game_link?: string;
  unique_game_id: string;
  moves_only?: string;
  end_time?: string;
  start_time?: string;
  platform?: string;
  user_color?: 'white' | 'black';
}

const GamesPage = () => {
  const router = useRouter();
  const session = useSession();
  
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [parsingMetrics, setParsingMetrics] = React.useState<{
    totalGames: number;
    parsingTime: number;
    gamesPerSecond: number;
    fileSize: number;
  } | null>(null);
  const [pgnText, setPgnText] = React.useState('');
  const [gameCount, setGameCount] = React.useState<number | null>(null);
  
  // User aliases and player confirmation state
  const [userAliases, setUserAliases] = React.useState<string[]>([]);
  const [pendingGames, setPendingGames] = React.useState<ChessGame[]>([]);
  const [currentGameIndex, setCurrentGameIndex] = React.useState<number>(-1);
  const [showPlayerConfirmation, setShowPlayerConfirmation] = React.useState(false);
  
  // Add a ref for the file input with proper typing
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  
  // Add state for user's games
  const [userGames, setUserGames] = React.useState<DBChessGame[]>([]);
  const [gamesLoading, setGamesLoading] = React.useState(false);
  const [gamesPage, setGamesPage] = React.useState(1);
  const [hasMoreGames, setHasMoreGames] = React.useState(true);
  
  // Add a new state for the confirmation timeout
  const [confirmationTimeoutId, setConfirmationTimeoutId] = React.useState<NodeJS.Timeout | null>(null);
  
  // Add a processing flag to prevent duplicate uploads
  const [isProcessing, setIsProcessing] = React.useState(false);
  
  // Add a state to track which games are currently being analyzed
  const [analyzingGames, setAnalyzingGames] = React.useState<Set<string>>(new Set());
  
  // Add a state to track the CURRENTLY ACTIVE game being analyzed
  const [activeAnalyzingGameId, setActiveAnalyzingGameId] = React.useState<string | null>(null);
  
  // Add a state to track if annotation is currently running
  const [isAnnotationRunning, setIsAnnotationRunning] = React.useState(false);

  // Add state for UI update trigger
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);
  
  // Add a key version for game cards
  const [gameCardsVersion, setGameCardsVersion] = React.useState(0);
  
  // Add a map to separately track analyzed status
  const [analyzedStatusMap, setAnalyzedStatusMap] = React.useState<Record<string, boolean>>({});
  
  // Redirect if not logged in
  React.useEffect(() => {
    if (!session) {
      router.push('/login');
    } else {
      fetchGameCount();
      fetchUserAliases();
      fetchUserGames();
      checkAnnotationStatus();
      
      // Subscribe to real-time game updates instead of polling
      setupRealtimeSubscription();
    }
    
    // Cleanup subscription and any loading states on unmount
    return () => {
      cleanupRealtimeSubscription();
      setLoading(false); // Ensure loading state is reset on unmount
    };
  }, [session, router]);

  // Set up Supabase real-time subscription with stronger guarantees
  const [subscription, setSubscription] = React.useState<any>(null);
  const [subscriptionReady, setSubscriptionReady] = React.useState(false);
  
  // Add a ref to the latest activeAnalyzingGameId for callback closures
  const activeGameIdRef = React.useRef<string | null>(null);
  
  // Better state management with a proper game status mapping
  const [gameStatusMap, setGameStatusMap] = React.useState<Record<string, 'analyzing' | 'queued' | 'analyzed'>>({});
  
  // Update the ref when activeAnalyzingGameId changes
  React.useEffect(() => {
    activeGameIdRef.current = activeAnalyzingGameId;
    
    // Update gameStatusMap whenever active game changes
    if (activeAnalyzingGameId) {
      setGameStatusMap(prev => ({
        ...prev,
        [activeAnalyzingGameId]: 'analyzing'
      }));
    }
  }, [activeAnalyzingGameId]);
  
  // Setup and prepare realtime subscriptions for different events
  const setupRealtimeSubscription = async () => {
    if (!session?.user?.id) return;
    
    // Clean up any existing subscription first
    if (subscription) {
      await supabase.removeChannel(subscription);
    }
    
    console.log('Setting up real-time subscription for game updates...');
    
    // Create a channel filtered to the current user's games
    // Listen for ALL event types to maximize chance of catching updates
    const newSubscription = supabase
      .channel('game-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events: INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'games',
          filter: `user_id=eq.${session.user.id}`,
        },
        async (payload) => {
          console.log('Received realtime event:', payload.eventType, payload);
          
          // Handle game updates
          if (payload.eventType === 'UPDATE') {
            // Process updates where analyzed status changed
            if (payload.new && payload.old && 
                payload.new.analyzed !== payload.old.analyzed) {
              
              console.log(`Game ${payload.new.id} analyzed status changed: ${payload.old.analyzed} -> ${payload.new.analyzed}`);
              
              // Get fresh status from all games to ensure we don't miss anything
              checkAnnotationStatus();
            }
          }
          // Also handle INSERT events to refresh the list
          else if (payload.eventType === 'INSERT') {
            console.log('New game added, refreshing list');
            checkAnnotationStatus();
          }
        }
      )
      .subscribe((status) => {
        console.log('Supabase subscription status:', status);
        if (status === 'SUBSCRIBED') {
          setSubscriptionReady(true);
          // Get initial state
          checkAnnotationStatus();
        }
      });
      
    setSubscription(newSubscription);
  };
  
  // Use a dedicated polling mechanism for more reliable updates during analysis
  // We'll use this as a backup to ensure UI stays in sync
  React.useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    // Only start polling if analysis is running
    if (isAnnotationRunning) {
      console.log('Starting analysis progress polling');
      
      // Poll every 2 seconds during analysis
      intervalId = setInterval(() => {
        checkAnnotationStatus();
      }, 2000);
    }
    
    // Clean up on unmount or when analysis stops
    return () => {
      if (intervalId) {
        console.log('Stopping analysis progress polling');
        clearInterval(intervalId);
      }
    };
  }, [isAnnotationRunning]);

  // Check if annotation process is currently running - with enhanced logging
  const checkAnnotationStatus = async () => {
    if (!session?.user?.id) return;
    
    try {
      console.log('Checking annotation status...');
      
      // Get games that are not yet analyzed
      const { data, error } = await supabase
        .from('games')
        .select('id, analyzed, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error checking annotation status:', error);
        return;
      }
      
      if (!data) return;
      
      // Build status maps
      const statusMap: Record<string, boolean> = {};
      const newGameStatusMap: Record<string, 'analyzing' | 'queued' | 'analyzed'> = {};
      
      // Process all games
      data.forEach(game => {
        statusMap[game.id] = game.analyzed;
        newGameStatusMap[game.id] = game.analyzed ? 'analyzed' : 'queued';
      });
      
      // Find unanalyzed games
      const unanalyzedGames = data.filter(game => !game.analyzed);
      const isRunning = unanalyzedGames.length > 0;
      
      // Set first unanalyzed game as active if we have unanalyzed games
      if (isRunning) {
        const activeId = unanalyzedGames[0].id;
        
        // Check if the active game has changed
        if (activeId !== activeAnalyzingGameId) {
          console.log(`Active game changed: ${activeAnalyzingGameId} -> ${activeId}`);
          setActiveAnalyzingGameId(activeId);
        }
        
        // Mark this game as analyzing in the status map
        newGameStatusMap[activeId] = 'analyzing';
      } else {
        if (activeAnalyzingGameId) {
          console.log('No more games to analyze, clearing active game');
        }
        setActiveAnalyzingGameId(null);
      }
      
      // Set annotation running state
      setIsAnnotationRunning(isRunning);
      
      // Update the set of games being analyzed
      const newAnalyzingGames = new Set(unanalyzedGames.map(game => game.id));
      setAnalyzingGames(newAnalyzingGames);
      
      // Update analyzed status map
      setAnalyzedStatusMap(statusMap);
      
      // Update game status map
      setGameStatusMap(newGameStatusMap);
      
      // Log any changes to game statuses
      const analyzedCount = data.filter(game => game.analyzed).length;
      const queuedCount = data.length - analyzedCount - (isRunning ? 1 : 0);
      console.log(`Game status: Analyzed=${analyzedCount}, Queued=${queuedCount}, Analyzing=${isRunning ? 1 : 0}`);
      
      // Update game objects efficiently
      setUserGames(prev => {
        // Create a new array only if there are changes
        let hasChanges = false;
        const updated = prev.map(game => {
          const serverAnalyzed = statusMap[game.id];
          if (serverAnalyzed !== undefined && serverAnalyzed !== game.analyzed) {
            hasChanges = true;
            return { ...game, analyzed: serverAnalyzed };
          }
          return game;
        });
        
        return hasChanges ? updated : prev;
      });
    } catch (err) {
      console.error('Error checking annotation status:', err);
    }
  };

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

  // Fetch user's games from the database with pagination
  const fetchUserGames = async (page = 1, pageSize = 12) => {
    if (!session?.user?.id) return;
    
    setGamesLoading(true);
    
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('user_id', session.user.id)
        .order('game_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }) // Fallback to created_at if game_date is null
        .range(from, to);
      
      if (error) {
        console.error('Error fetching games:', error);
        setMessage({
          text: `Error fetching games: ${error.message}`,
          type: 'error'
        });
      } else {
        if (data.length < pageSize) {
          setHasMoreGames(false);
        }
        
        // If it's the first page, replace all games
        // Otherwise append to existing games
        if (page === 1) {
          setUserGames(data);
        } else {
          setUserGames(prevGames => [...prevGames, ...data]);
        }
      }
    } catch (err) {
      console.error('Error fetching games:', err);
      setMessage({
        text: `Error fetching games: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: 'error'
      });
    } finally {
      setGamesLoading(false);
    }
  };
  
  // Load more games
  const loadMoreGames = () => {
    const nextPage = gamesPage + 1;
    setGamesPage(nextPage);
    fetchUserGames(nextPage);
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
    
    // Check if either player matches any alias - use lowercase comparison for case insensitive matching
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

  // Modified process confirmed games with better status updates
  const processConfirmedGames = async (gamesToProcess?: ChessGame[]) => {
    // Use provided games or fall back to state
    const games = gamesToProcess || pendingGames;
    
    if (!session?.user?.id || games.length === 0) {
      setIsProcessing(false);
      setLoading(false); // Make sure to reset loading
      return;
    }
    
    setLoading(true);
    setMessage({ text: 'Uploading games...', type: 'info' });
    
    try {
      // Prepare games for insertion
      const gamesToInsert = games.map(game => prepareGameForInsert(game, session.user.id));
      
      // Process in batches of 50 to stay within limits
      const batchSize = 50;
      let successCount = 0;
      let errorCount = 0;
      let newGameIds: string[] = [];
      
      for (let i = 0; i < gamesToInsert.length; i += batchSize) {
        const batch = gamesToInsert.slice(i, i + batchSize);
        
        try {
          // Capture the IDs of the inserted games
          const { data: insertedData, error: insertError } = await supabase
            .from('games')
            .insert(batch)
            .select('id');
            
          if (insertError) {
            errorCount += batch.length;
            console.error('Error inserting batch:', insertError);
          } else if (insertedData) {
            successCount += insertedData.length;
            
            // Collect the new game IDs for the analyzing state
            newGameIds = [...newGameIds, ...insertedData.map(game => game.id)];
          }
        } catch (batchError) {
          console.error('Exception during batch insert:', batchError);
          errorCount += batch.length;
        }
        
        // Update progress
        setUploadProgress(Math.round(((i + batch.length) / gamesToInsert.length) * 100));
      }
      
      // Reset pending games state
      setPendingGames([]);
      setCurrentGameIndex(-1);
      setShowPlayerConfirmation(false);
      
      // Update game count after successful upload
      await fetchGameCount();
      
      // Refresh the games list to show the new games
      await fetchUserGames(1);
      
      // Add the new games to the analyzing set
      if (newGameIds.length > 0) {
        setAnalyzingGames(prev => {
          const newSet = new Set(prev);
          newGameIds.forEach(id => newSet.add(id));
          return newSet;
        });
        
        // Set the first new game as the active one if no active game
        if (!activeAnalyzingGameId) {
          setActiveAnalyzingGameId(newGameIds[0]);
        }
        
        // Make sure annotation running is set to true
        setIsAnnotationRunning(true);
      }
      
      // Show appropriate message
      if (errorCount > 0) {
        setMessage({ 
          text: `Upload complete: ${successCount} games uploaded, ${errorCount} errors. Analysis started in background.`,
          type: 'error'
        });
      } else {
        setMessage({ 
          text: `${successCount} games uploaded successfully. Analysis started in background.`,
          type: 'success'
        });
      }
      
      // Immediately set loading to false after upload is complete
      setLoading(false);
      
      // Call the processUnannotatedGames API after successful upload - only if games were uploaded
      if (session?.user?.id && successCount > 0) {
        try {
          // Get the session access token to use directly
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          
          // Make sure subscription is active BEFORE starting analysis
          if (!subscription || !subscriptionReady) {
            await setupRealtimeSubscription();
            // Wait a bit for subscription to initialize
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          // Call the API with explicit access token
          if (accessToken) {
            setIsAnnotationRunning(true); // Set as running before API call
            await gameApi.processUnannotatedGames(session.user.id, accessToken);
            
            // Force initial state refresh after starting analysis
            setTimeout(() => {
              checkAnnotationStatus();
            }, 300);
          } else {
            throw new Error('No access token available');
          }
        } catch (analysisError) {
          console.error('Error triggering game analysis:', analysisError);
          // Don't change the success message - analysis is separate now
        }
      }
    } catch (err) {
      setMessage({ text: 'Error uploading games: ' + (err as Error).message, type: 'error' });
      setLoading(false); // Make sure loading is reset on error
    } finally {
      setLoading(false); // Guarantee loading state is reset
      setIsProcessing(false);
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

  // Modify the findNextUnconfirmedGame function to include a timeout
  const findNextUnconfirmedGame = (games: ChessGame[], startIndex: number) => {
    try {
      // Clear any existing timeout
      if (confirmationTimeoutId) {
        clearTimeout(confirmationTimeoutId);
        setConfirmationTimeoutId(null);
      }
      
      let unconfirmedCount = 0;
      for (let i = 0; i < games.length; i++) {
        if (!games[i].user_color) {
          unconfirmedCount++;
        }
      }
      
      // If no unconfirmed games found, just process all games
      if (unconfirmedCount === 0) {
        setCurrentGameIndex(-1);
        setShowPlayerConfirmation(false);
        handleAllGamesColored(games);
        return;
      }
      
      for (let i = startIndex; i < games.length; i++) {
        if (!games[i].user_color) {
          setCurrentGameIndex(i);
          setShowPlayerConfirmation(true);
          
          // Set a timeout to force proceed if the confirmation modal doesn't appear
          const timeoutId = setTimeout(() => {
            // Force setting user colors to prevent getting stuck
            const updatedGames = [...games];
            for (let j = 0; j < updatedGames.length; j++) {
              if (!updatedGames[j].user_color) {
                // Default to playing as white if we don't know
                updatedGames[j].user_color = 'white';
              }
            }
            setPendingGames(updatedGames);
            setCurrentGameIndex(-1);
            setShowPlayerConfirmation(false);
            setTimeout(() => processConfirmedGames(updatedGames), 50);
          }, 5000); // 5 second timeout
          
          setConfirmationTimeoutId(timeoutId);
          return;
        }
      }
      
      // No more games to confirm, process all games
      setCurrentGameIndex(-1);
      setShowPlayerConfirmation(false);
      handleAllGamesColored(games);
    } catch (error) {
      // If there's an error, try to continue with uploading anyway
      setCurrentGameIndex(-1);
      setShowPlayerConfirmation(false);
      handleAllGamesColored(games); 
    }
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

    try {
      setLoading(true);
      setMessage({ text: 'Processing PGN file...', type: 'info' });
      setUploadProgress(0);
      setParsingMetrics(null);

      const file = files[0];
      const fileSize = file.size;
      const text = await file.text();
      
      // Always reset file input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
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
          // Reset file input to allow selecting the same file again
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
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
          
          // If we have no aliases at all, we need to ask for at least one
          if (userAliases.length === 0) {
            console.log('No aliases configured yet, proceeding to confirmation');
            setMessage({ 
              text: `Please confirm which player you are in the games.`,
              type: 'info'
            });
            findNextUnconfirmedGame(gamesWithColor, 0);
          } else {
            console.log(`${unconfirmedGames.length} games need confirmation with existing aliases:`, userAliases);
            setMessage({ 
              text: `${unconfirmedGames.length} of ${gamesWithColor.length} games need player confirmation.`,
              type: 'info'
            });
            findNextUnconfirmedGame(gamesWithColor, 0);
          }
        } else {
          // All games have user_color determined, proceed with upload
          console.log('All games have user color determined automatically, proceeding to upload');
          handleAllGamesColored(gamesWithColor);
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
        
        // Reset file input to allow selecting the same file again
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (fetchError) {
        console.error('Error during duplicate checking:', fetchError);
        setMessage({ 
          text: `Error checking for duplicates: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
          type: 'error'
        });
        setLoading(false);
        // Reset file input to allow selecting the same file again
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (err) {
      console.error('Error in handleFileUpload:', err);
      setMessage({ text: 'Error processing PGN file: ' + (err as Error).message, type: 'error' });
    } finally {
      // Always reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Only reset loading state if we're not proceeding to another step
      if (!pendingGames.length) {
        setLoading(false);
      }
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
          
          // If we have no aliases at all, we need to ask for at least one
          if (userAliases.length === 0) {
            console.log('No aliases configured yet, proceeding to confirmation');
            setMessage({ 
              text: `Please confirm which player you are in the games.`,
              type: 'info'
            });
            findNextUnconfirmedGame(gamesWithColor, 0);
          } else {
            console.log(`${unconfirmedGames.length} games need confirmation with existing aliases:`, userAliases);
            setMessage({ 
              text: `${unconfirmedGames.length} of ${gamesWithColor.length} games need player confirmation.`,
              type: 'info'
            });
            findNextUnconfirmedGame(gamesWithColor, 0);
          }
        } else {
          // All games have user_color determined, proceed with upload
          console.log('All games have user color determined automatically, proceeding to upload');
          handleAllGamesColored(gamesWithColor);
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

  // Add cleanup for the confirmation timeout
  React.useEffect(() => {
    return () => {
      // Clean up the timeout when the component unmounts
      if (confirmationTimeoutId) {
        clearTimeout(confirmationTimeoutId);
      }
    };
  }, [confirmationTimeoutId]);

  // Add this cancel upload function
  const cancelUpload = () => {
    // Clear timeout if active
    if (confirmationTimeoutId) {
      clearTimeout(confirmationTimeoutId);
      setConfirmationTimeoutId(null);
    }
    
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

  // This function is causing issues, let's wrap it in a try-catch and add more logging
  const handleAllGamesColored = (gamesWithColor: ChessGame[]) => {
    if (isProcessing) {
      return;
    }
    
    try {
      setIsProcessing(true);
      setTimeout(() => {
        processConfirmedGames(gamesWithColor);
      }, 50);
    } catch (error) {
      console.error('Error in handleAllGamesColored:', error);
      setMessage({ 
        text: 'Error preparing games for upload',
        type: 'error'
      });
      setLoading(false);
      setIsProcessing(false);
    }
  };

  // Restore the cleanup function
  const cleanupRealtimeSubscription = async () => {
    if (subscription) {
      await supabase.removeChannel(subscription);
      setSubscription(null);
      setSubscriptionReady(false);
    }
  };
  
  // Restore the force refresh function without DOM manipulation
  const forceRefreshGameData = async () => {
    // Refresh all data
    await fetchGameCount();
    await fetchUserGames(1);
    await checkAnnotationStatus();
  };

  // Before the component returns, generate game cards - Now more efficient with unique keys
  const generateGameCards = () => {
    return userGames.map((game) => {
      // Determine if the user played as white or black
      const userPlayedAs = game.user_color || 'unknown';
      
      // Format the date
      const formattedDate = game.game_date 
        ? new Date(game.game_date).toLocaleDateString() 
        : 'Unknown date';
      
      // Determine the winner for highlighting
      let whitePlayerClass = 'text-gray-300';
      let blackPlayerClass = 'text-gray-300';
      
      if (game.result === '1-0') {
        // White won
        whitePlayerClass = 'text-green-400 font-medium';
      } else if (game.result === '0-1') {
        // Black won
        blackPlayerClass = 'text-green-400 font-medium';
      } else if (game.result === '1/2-1/2') {
        // Draw - highlight both
        whitePlayerClass = 'text-yellow-400 font-medium';
        blackPlayerClass = 'text-yellow-400 font-medium';
      }
      
      // Add indicator for user's color
      if (userPlayedAs === 'white') {
        whitePlayerClass += ' flex items-center';
      }
      if (userPlayedAs === 'black') {
        blackPlayerClass += ' flex items-center';
      }
      
      // Get game status with more precise logging
      const gameStatus = gameStatusMap[game.id] || (game.analyzed ? 'analyzed' : 'queued');
      const isBeingAnalyzed = gameStatus === 'analyzing';
      
      // Unique key that includes both id and status to ensure rerendering when status changes
      const cardKey = `${game.id}-${gameStatus}`;
      
      return (
        <div 
          key={cardKey}
          className="game-card bg-gradient-to-br from-gray-700 to-gray-800 hover:from-indigo-900 hover:to-purple-900 rounded-lg p-4 border border-gray-700 hover:border-indigo-500 transition-all duration-200 cursor-pointer transform hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-500/20 active:shadow-md active:translate-y-0 relative"
          data-analyzing={isBeingAnalyzed ? "true" : "false"}
          data-status={gameStatus}
          style={{
            backgroundImage: 'linear-gradient(to bottom right, rgba(55, 65, 81, 1), rgba(31, 41, 55, 1))'
          }}
          onClick={() => router.push(`/analyze?gameId=${game.id}`)}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.98)';
            e.currentTarget.style.boxShadow = '0 0 15px rgba(79, 70, 229, 0.4)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(79, 70, 229, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = '';
            e.currentTarget.style.boxShadow = '';
            e.currentTarget.style.backgroundImage = 'linear-gradient(to bottom right, rgba(55, 65, 81, 1), rgba(31, 41, 55, 1))';
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundImage = 'linear-gradient(to bottom right, rgba(67, 56, 202, 0.8), rgba(126, 34, 206, 0.9))';
          }}
        >
          <div className="flex justify-between items-center mb-3">
            <div className="text-base font-medium text-white">
              {formattedDate}
            </div>
            
            {/* Analysis status indicator - updated to use gameStatus */}
            {gameStatus === 'analyzing' ? (
              <div className="flex items-center bg-blue-900/70 text-blue-300 text-xs px-2 py-1 rounded-full">
                <div className="animate-pulse w-2 h-2 bg-blue-400 rounded-full mr-1.5"></div>
                Analyzing
              </div>
            ) : gameStatus === 'queued' ? (
              <div className="flex items-center bg-gray-800/70 text-gray-400 text-xs px-2 py-1 rounded-full">
                <div className="w-2 h-2 bg-gray-500 rounded-full mr-1.5"></div>
                Queued
              </div>
            ) : (
              <div className="flex items-center bg-green-900/70 text-green-300 text-xs px-2 py-1 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Analyzed
              </div>
            )}
          </div>
          
          <div className="mt-2 space-y-2">
            <div className={`${whitePlayerClass} rounded bg-gray-100/10 px-2 py-1.5`}>
              <div className="flex items-center space-x-2">
                {userPlayedAs === 'white' && (
                  <span className="inline-flex w-2.5 h-2.5 rounded-full bg-indigo-400 ring-2 ring-indigo-300 ring-opacity-50"></span>
                )}
                <span className="truncate flex-grow text-sm">{game.white_player || 'Unknown'}</span>
              </div>
            </div>
            
            <div className="flex items-center justify-center">
              <div className="border-t border-gray-600 w-full"></div>
              <div className="text-xs text-gray-400 font-medium px-2">vs</div>
              <div className="border-t border-gray-600 w-full"></div>
            </div>
            
            <div className={`${blackPlayerClass} rounded bg-gray-900/80 px-2 py-1.5`}>
              <div className="flex items-center space-x-2">
                {userPlayedAs === 'black' && (
                  <span className="inline-flex w-2.5 h-2.5 rounded-full bg-indigo-400 ring-2 ring-indigo-300 ring-opacity-50"></span>
                )}
                <span className="truncate flex-grow text-sm">{game.black_player || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      );
    });
  };
  
  // Add a refresh button to the debug panel
  const DebugInfo = () => {
    // Only show in development
    if (process.env.NODE_ENV !== 'development') return null;
    
    return (
      <div className="fixed bottom-4 right-4 bg-gray-900 text-xs text-white p-2 rounded shadow z-50 opacity-70 hover:opacity-100">
        <div>Subscription: {subscription ? 'Active' : 'Inactive'}</div>
        <div>Loading: {loading ? 'True' : 'False'}</div>
        <div>Processing: {isProcessing ? 'True' : 'False'}</div>
        <div>Analyzing: {analyzingGames.size} games</div>
        <div>Active Game: {activeAnalyzingGameId || 'None'}</div>
        <button 
          onClick={checkAnnotationStatus}
          className="mt-2 px-2 py-1 bg-blue-700 rounded text-white text-xs hover:bg-blue-600"
        >
          Refresh Status
        </button>
      </div>
    );
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
      
      {/* Debug component */}
      <DebugInfo />
      
      <div className="w-full max-w-4xl px-4 py-8">
        {/* Games List Section */}
        <div className="bg-gray-800 shadow-lg rounded-lg p-6 mb-8 text-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">My Chess Games</h2>
            <div className="text-sm text-gray-400">
              {gameCount !== null ? `${gameCount} games total` : 'Loading...'}
            </div>
          </div>
          
          {userGames.length === 0 ? (
            <div className="text-center py-10">
              {gamesLoading ? (
                <div className="flex flex-col items-center">
                  <svg className="animate-spin h-8 w-8 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-gray-400">Loading your games...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-400 mb-2">No games found</p>
                  <p className="text-gray-500 text-sm">Upload your first game below</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                {/* Use the normal function call approach - refreshTrigger included to force re-renders */}
                {refreshTrigger || true ? generateGameCards() : null}
              </div>
              
              {hasMoreGames && (
                <div className="mt-4 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMoreGames}
                    isLoading={gamesLoading}
                    disabled={gamesLoading}
                  >
                    Load More Games
                  </Button>
                </div>
              )}
            </>
          )}
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
          
          {/* Analysis status indicator */}
          {isAnnotationRunning && (
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-md">
              <div className="flex items-center text-blue-300">
                <div className="animate-pulse w-2.5 h-2.5 bg-blue-400 rounded-full mr-2"></div>
                <span>Game analysis running in the background</span>
              </div>
            </div>
          )}
          
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
                  </span>
                </div>
                <div className="flex justify-between mb-2 items-center">
                  <span className="text-white font-medium">Black:</span>
                  <span className="text-gray-300 flex items-center">
                    {pendingGames[currentGameIndex].blackPlayer || 'Unknown'}
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