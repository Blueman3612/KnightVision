import React, { ReactNode, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Chessboard from '@/components/Chessboard';
import { Chess } from 'chess.js';
import Head from 'next/head';
import { useToast, Button, Tooltip } from '../components/ui';
import Modal from '../components/ui/Modal';

interface TutorPageProps {
  children?: ReactNode;
}

// Define game state types
type GameState = 'playing' | 'saving' | 'resetting' | 'ready';
type TutorMode = 'selection' | 'playing';

function TutorPage() {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const toast = useToast();
  const chessRef = useRef(new Chess());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [playerSide, setPlayerSide] = useState<'white' | 'black'>('white');
  const [fen, setFen] = useState<string>(chessRef.current.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameStartTime, setGameStartTime] = useState<Date>(new Date());
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [boardKey, setBoardKey] = useState<number>(0);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  
  // Mode selection state
  const [tutorMode, setTutorMode] = useState<TutorMode>('selection');
  
  // Track if we're temporarily in menu mode but have a game in progress
  const [gameInProgress, setGameInProgress] = useState<boolean>(false);
  
  // Replace reducer with individual state variables
  const [gameStatus, setGameStatus] = useState<string>('');
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [disableBoard, setDisableBoard] = useState<boolean>(false);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [needsReset, setNeedsReset] = useState<boolean>(false);
  
  // New state for game end modal
  const [showGameEndModal, setShowGameEndModal] = useState<boolean>(false);
  const [gameSaved, setGameSaved] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<string>('');
  const [finalMoveCount, setFinalMoveCount] = useState<number>(0);

  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If menu is not open, don't do anything
      if (!menuOpen) return;
      
      // Check if the click was outside both the menu and the menu button
      const menuElement = menuRef.current;
      const buttonElement = menuButtonRef.current;
      
      const targetElement = event.target as Node;
      
      const isOutsideMenu = menuElement && !menuElement.contains(targetElement);
      const isOutsideButton = buttonElement && !buttonElement.contains(targetElement);
      
      // If clicked outside both menu and button, close the menu
      if (isOutsideMenu && isOutsideButton) {
        setMenuOpen(false);
      }
    };
    
    // Add the event listener
    document.addEventListener('mousedown', handleClickOutside);
    
    // Clean up
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  // Reset game start time when a new game begins
  useEffect(() => {
    if (moveHistory.length === 0) {
      setGameStartTime(new Date());
    }
  }, [moveHistory]);

  // Handle game reset after game state transitions
  useEffect(() => {
    // When state changes to resetting, perform the reset
    if (gameState === 'resetting' && needsReset) {
      const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      
      // Reset board state
      const chess = chessRef.current;
      try {
        if (chess) {
          chess.reset();
          setFen(startingFen);
        }
      } catch (error) {
        console.error('Error resetting chess instance:', error);
      }
      
      // Reset all state
      setMoveHistory([]);
      setBoardKey(prev => prev + 1);
      
      // Notify that reset is complete
      setGameState('ready');
      setGameStatus('');
      setIsGameOver(false);
      setDisableBoard(false);
      setNeedsReset(false);
      setGameInProgress(false);
      
      // Go back to selection mode when game is reset
      setTutorMode('selection');
    }
  }, [gameState, needsReset]);

  // Save game when it ends
  useEffect(() => {
    const saveGame = async () => {
      // Store the move count for the modal
      setFinalMoveCount(moveHistory.length);
      
      // Only save game if player has made at least 8 moves (changed from 4)
      if (isGameOver && moveHistory.length >= 8 && session) {
        try {
          // Get the PGN from the chess instance
          const chess = chessRef.current;
          const chessAny = chess as any; // Using any type to handle version differences in chess.js
          
          // Format date properly with dots instead of dashes
          const today = new Date();
          const formattedDate = today.toISOString().split('T')[0].replace(/-/g, '.');
          
          // Fetch the user's display_name from the public.users table
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('display_name')
            .eq('id', session.user.id)
            .single();
            
          // Use display_name from the users table or fall back to email
          const userName = (userData?.display_name) ? userData.display_name : session.user.email;
          
          // Reset the chess game to initial position
          if (typeof chessAny.reset === 'function') {
            chessAny.reset();
          } else {
            // Fallback if reset is not available
            chessAny.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
          }
          
          // Get game ending status
          const inCheckmate = typeof chessAny.in_checkmate === 'function' ? chessAny.in_checkmate() : false;
          const isDraw = typeof chessAny.in_draw === 'function' ? chessAny.in_draw() : false;
          const isStalemate = typeof chessAny.in_stalemate === 'function' ? chessAny.in_stalemate() : false;
          const isThreefoldRepetition = typeof chessAny.in_threefold_repetition === 'function' ? chessAny.in_threefold_repetition() : false;
          const turn = typeof chessAny.turn === 'function' ? chessAny.turn() : 'w';
          
          // Determine accurate result and termination
          // If gameStatus contains "resigned", it's a resignation
          const isResignation = gameResult.toLowerCase().includes('resigned');
          
          let result = '1/2-1/2'; // Default
          let terminationReason = 'normal';
          let terminationText = '';
          
          if (inCheckmate) {
            // Checkmate - the player whose turn it is has lost
            result = turn === 'w' ? '0-1' : '1-0';
            terminationReason = 'checkmate';
            terminationText = turn === 'w' ? 'Black won by checkmate' : 'White won by checkmate';
          } else if (isResignation) {
            // Resignation - the player who resigned has lost
            result = gameResult.toLowerCase().includes('white resigned') ? '0-1' : '1-0';
            terminationReason = 'resignation';
            terminationText = gameResult;
          } else if (isStalemate) {
            // Stalemate is a draw
            result = '1/2-1/2';
            terminationReason = 'stalemate';
            terminationText = 'Game drawn by stalemate';
          } else if (isThreefoldRepetition) {
            result = '1/2-1/2';
            terminationReason = 'repetition';
            terminationText = 'Game drawn by repetition';
          } else if (isDraw) {
            result = '1/2-1/2';
            terminationReason = 'draw';
            terminationText = 'Game drawn';
          }
          
          // Use most descriptive termination for PGN header
          const pgnTermination = terminationText || terminationReason;
          
          // Set the headers for the PGN
          if (typeof chessAny.header === 'function') {
            chessAny.header(
              'Event', 'Chess Tutor Game',
              'Site', 'KnightVision',
              'Date', formattedDate,
              'White', playerSide === 'white' ? userName : 'KnightVision',
              'Black', playerSide === 'black' ? userName : 'KnightVision',
              'WhiteElo', '?',
              'BlackElo', '?',
              'TimeControl', '-',
              'Result', result,
              'Termination', pgnTermination
            );
          }
          
          // Apply all the moves from move history to the fresh chess game
          // This ensures the PGN will contain all moves
          for (const move of moveHistory) {
            try {
              if (typeof chessAny.move === 'function') {
                chessAny.move(move);
              }
            } catch (moveError) {
              console.error(`Error applying move ${move}:`, moveError);
            }
          }
          
          // Get the complete PGN with moves
          const pgn = typeof chessAny.pgn === 'function' ? chessAny.pgn() : '';
          
          // Extract the moves-only part of the PGN (everything after the last header)
          const lastHeaderIndex = pgn.lastIndexOf(']') + 1;
          const movesOnly = pgn.substring(lastHeaderIndex).trim();
          
          // Convert date format from yyyy.mm.dd to yyyy-mm-dd for the database
          const databaseDate = formattedDate.replace(/\./g, '-');
          
          // Generate a unique game ID that is consistent and can be used for duplicate detection
          // Use components that will be unique for this game: player names, date, result, moves
          const moveText = typeof chessAny.history === 'function' ? chessAny.history().join(' ') : moveHistory.join(' ');
          const uniqueComponents = [
            'KnightVision',
            formattedDate,
            playerSide === 'white' ? userName : 'KnightVision',
            playerSide === 'black' ? userName : 'KnightVision',
            result,
            moveText.substring(0, 100) // Use first 100 chars of moves for uniqueness
          ];
          const uniqueGameId = uniqueComponents.join('_');
          
          // Check if this game already exists in the database
          const { data: existingGames, error: checkError } = await supabase
            .from('games')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('unique_game_id', uniqueGameId)
            .limit(1);
            
          if (checkError) {
            console.error('Error checking for duplicate games:', checkError);
            // Continue trying to save the game anyway
          } else if (existingGames && existingGames.length > 0) {
            // Game already exists, don't save
            setGameState('resetting');
            setNeedsReset(true);
            return;
          }
          
          // First, try direct insert with the proper UUID type
          const { data: directData, error: directError } = await supabase
            .from('games')
            .insert({
              user_id: session.user.id, // Pass the UUID directly
              pgn: pgn,
              result: result,
              analyzed: false,
              cpu: true,
              white_player: playerSide === 'white' ? userName : 'KnightVision',
              black_player: playerSide === 'black' ? userName : 'KnightVision',
              white_elo: playerSide === 'white' ? null : 1350,
              black_elo: playerSide === 'black' ? null : 1350,
              platform: 'KnightVision',
              start_time: gameStartTime.toISOString(),
              end_time: new Date().toISOString(),
              termination: terminationReason,
              unique_game_id: uniqueGameId,
              user_color: playerSide,
              // Add missing columns
              event: 'Chess Tutor Game',
              site: 'KnightVision',
              game_date: databaseDate,
              moves_only: movesOnly
            })
            .select('id')
            .single();
          
          if (directError) {
            console.error('Error in direct insert:', directError);
            
            // Fallback to RPC method if direct insert fails
            const { data: rpcData, error: rpcError } = await supabase.rpc('insert_game', {
            p_pgn: pgn,
            p_result: result
          });
          
            if (rpcError) {
              console.error('Error saving game with RPC:', rpcError);
              toast.error('Failed to save your game');
              setGameSaved(false);
              setShowGameEndModal(true);
              setGameState('resetting');
              setNeedsReset(true);
              return;
            }
          
          // Update the game to set cpu = true and other metadata
          const { error: updateError } = await supabase
            .from('games')
            .update({
              cpu: true,
                white_player: playerSide === 'white' ? userName : 'KnightVision',
                black_player: playerSide === 'black' ? userName : 'KnightVision',
              white_elo: playerSide === 'white' ? null : 1350,
              black_elo: playerSide === 'black' ? null : 1350,
                platform: 'KnightVision',
              start_time: gameStartTime.toISOString(),
              end_time: new Date().toISOString(),
                termination: terminationReason,
              unique_game_id: uniqueGameId,
                user_color: playerSide,
                // Add missing columns
                event: 'Chess Tutor Game',
                site: 'KnightVision',
                game_date: databaseDate,
                moves_only: movesOnly
              })
              .eq('id', rpcData);
            
          if (updateError) {
            console.error('Error updating game metadata:', updateError);
            setGameSaved(false);
            setShowGameEndModal(true);
          } else {
            setGameSaved(true);
            setShowGameEndModal(true);
          }
          } else {
            setGameSaved(true);
            setShowGameEndModal(true);
          }
        } catch (error) {
          console.error('Error in game saving process:', error);
          toast.error('An error occurred while saving your game');
          // Even on error, we need to complete the save process
          setGameSaved(false);
          setShowGameEndModal(true);
        }
      } else {
        // Not enough moves to save the game
        setGameSaved(false);
        setShowGameEndModal(true);
      }
      
      // Don't trigger reset here - let the modal handle it when it's closed
    };
    
    // Only call saveGame when state is 'saving'
    if (gameState === 'saving') {
      saveGame();
    }
  }, [gameState, isGameOver, gameStatus, moveHistory, session, playerSide, supabase, gameStartTime, toast]);

  const handleMove = (from: string, to: string) => {
    try {
      // Get reference to chess instance
      const chess = chessRef.current;
      const chessAny = chess as any;
      
      // IMPORTANT: First, load the current position from the Chessboard component
      // to ensure our chess instance is in sync
      try {
        // We need to ensure the parent's chess.js instance is in sync with the board
        const childFen = chessAny.fen();
        
        if (typeof chessAny.load === 'function') {
          chessAny.load(childFen);
        }
      } catch (loadError) {
        console.error('Error loading position:', loadError);
      }
      
      // Now that our chess instance is in sync, we can extract the last move
      let lastMoveSan = '';
      
      try {
        // Get the history of moves
        const history = typeof chessAny.history === 'function' ? 
          (chessAny.history({ verbose: false }) || []) : [];
        
        // Get the last move in SAN format
        if (history.length > 0) {
          lastMoveSan = history[history.length - 1];
        } else {
          // Fallback if we can't get the move history
          lastMoveSan = `${from}-${to}`;
        }
      } catch (historyError) {
        console.error('Error getting move history:', historyError);
        lastMoveSan = `${from}-${to}`;
      }
      
      // Update move history with the SAN notation
      if (lastMoveSan) {
        setMoveHistory(prev => {
          const newHistory = [...prev, lastMoveSan];
          return newHistory;
        });
      }
      
      // Update our FEN state
      const updatedPosition = chessAny.fen();
      setFen(updatedPosition);
      
      // Check game status
      const isCheckmate = typeof chessAny.in_checkmate === 'function' ? 
        chessAny.in_checkmate() : false;
      const isDraw = typeof chessAny.in_draw === 'function' ? 
        chessAny.in_draw() : false;
      const isStalemate = typeof chessAny.in_stalemate === 'function' ? 
        chessAny.in_stalemate() : false;
      const isThreefoldRepetition = typeof chessAny.in_threefold_repetition === 'function' ? 
        chessAny.in_threefold_repetition() : false;
      
      const gameOver = isCheckmate || isDraw || isStalemate || isThreefoldRepetition;
      
      if (gameOver) {
        // Update game state
        let status = '';
        let result = '';
        
        if (isCheckmate) {
          const turn = typeof chessAny.turn === 'function' ? chessAny.turn() : 'w';
          const winner = turn === 'w' ? 'Black' : 'White';
          status = 'Checkmate!';
          result = `${winner} won by checkmate`;
        } else if (isDraw) {
          status = 'Draw!';
          result = 'Game drawn';
        } else if (isStalemate) {
          status = 'Stalemate!';
          result = 'Game drawn by stalemate';
        } else if (isThreefoldRepetition) {
          status = 'Draw by repetition!';
          result = 'Game drawn by repetition';
        } else if (typeof chessAny.insufficient_material === 'function' ? 
          chessAny.insufficient_material() : false) {
          status = 'Draw by insufficient material!';
          result = 'Game drawn by insufficient material';
        }
        
        // First disable the board to prevent evaluation API calls
        setDisableBoard(true);
        setBoardKey(prev => prev + 1);
        
        // Then update the rest of the state
        setGameState('saving');
        setGameStatus(status);
        setGameResult(result);
        setIsGameOver(true);
      } else if (typeof chessAny.in_check === 'function' && chessAny.in_check()) {
        // In check but game not over
        setGameState('playing');
        setGameStatus('');
        setIsGameOver(false);
        setDisableBoard(false);
        setNeedsReset(false);
      }
    } catch (e) {
      console.error('Error handling move:', e);
    }
  };

  const resetGame = () => {
    const chess = chessRef.current;
    chess.reset();
    setFen(chess.fen());
    setMoveHistory([]);
    setGameStartTime(new Date());
    setGameState('playing');
    setGameStatus('');
    setGameResult('');
    setIsGameOver(false);
    setDisableBoard(false);
    setNeedsReset(false);
    setShowGameEndModal(false);
    toast.success('New game started!');
  };
  
  // Function to handle return to menu while preserving game state
  const goToMenu = () => {
    if (moveHistory.length > 0 && !isGameOver) {
      // If we have moves and game isn't over, we're pausing a game in progress
      setGameInProgress(true);
    }
    setTutorMode('selection');
    setMenuOpen(false);
  };

  // Start the interactive game
  const startTutorGame = () => {
    if (gameInProgress) {
      // If we have a game in progress, just go back to it
      setTutorMode('playing');
      setGameInProgress(false);
    } else {
      // Otherwise, start a new game
      resetGame();
      setTutorMode('playing');
    }
  };

  // A more reliable way to check if sides can be switched
  const canSwitchSides = () => {
    try {
      // Game in progress flag takes precedence - if we're showing a paused game, don't allow switching
      if (gameInProgress) {
        return false;
      }
      
      // If game is over, always allow switching
      if (isGameOver) {
        return true;
      }
      
      // Check if no moves have been made yet (starting position)
      if (moveHistory.length === 0) {
        return true;
      }
      
      // Allow switching if only one move has been made, regardless of who's playing
      // This covers both:
      // - When player is white and they just moved
      // - When player is black and computer (white) just moved
      if (moveHistory.length === 1) {
        return true;
      }
      
      // In all other cases, don't allow switching (game has progressed too far)
      return false;
    } catch (error) {
      console.error("Error in canSwitchSides:", error);
      return false; // Default to not allowing side switch on error
    }
  };

  const switchSides = () => {
    // First check if we're allowed to switch sides
    if (!canSwitchSides()) {
      toast.error("Cannot switch sides at this point in the game");
      setMenuOpen(false);
      return;
    }
    
    // Switch the player's side
    const newPlayerSide = playerSide === 'white' ? 'black' : 'white';
    
    // Reset everything to a clean slate
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    // Reset the chess instance
    const chess = chessRef.current;
    chess.reset();
    
    // Close the menu first
    setMenuOpen(false);
    
    // First update the state to reflect the new player side for both cases
    setPlayerSide(newPlayerSide);
    setOrientation(newPlayerSide);
    setFen(startingFen);
    setMoveHistory([]);
    setGameStartTime(new Date());
    
    // Reset game state 
    setGameState('playing');
    setGameStatus('');
    setIsGameOver(false);
    setDisableBoard(false);
    setNeedsReset(false);
    
    // Show toast notification
    toast.success(`You are now playing as ${newPlayerSide}`);
    
    // When playing as black, we need to make white's first move
    if (newPlayerSide === 'black') {
      // Let state updates complete, then allow the board component to handle the first move
      // The Chessboard component will detect that it's white's turn but player is black
      // and will automatically make the move using the API
      setTimeout(() => {
        // Force a refresh of the FEN to trigger the move in the component
        setFen(startingFen);
      }, 800);
    }
  };

  // Fix orientation bug when resigning as black
  const resignGame = () => {
    // Store the current player side 
    const currentColor = playerSide;
    
    // Immediately disable the board and increment board key to force re-render
    // and prevent any pending evaluation calls
    setDisableBoard(true);
    setBoardKey(prev => prev + 1);
    
    // Set game over state
    setGameState('saving');
    const resignMessage = `${currentColor === 'white' ? 'White' : 'Black'} resigned`;
    setGameStatus('Resignation');
    setGameResult(resignMessage);
    setIsGameOver(true);
    
    // Close menu
    setMenuOpen(false);
  };
  
  const flipBoard = () => {
    // Toggle orientation
    const newOrientation = orientation === 'white' ? 'black' : 'white';
    
    // Set the new orientation
    setOrientation(newOrientation);
    setMenuOpen(false);
    
    // Force a proper refresh of legal moves by using the onMove handler
    // The onMove handler will properly update the board state without remounting
    setTimeout(() => {
      // Small delay to ensure the orientation change has taken effect
      // We don't need to change FEN, just ensure the board refreshes with the right permission
      const chess = chessRef.current;
      // Setting the same FEN again will force a refresh without changing the position
      setFen(chess.fen());
    }, 100);
  }

  // If not logged in, show nothing (will redirect)
  if (!session) {
    return null;
  }

  return (
    <>
      <Head>
        <title>KnightVision</title>
      </Head>
      <div className="w-full max-w-3xl flex flex-col items-center justify-center">
        <div className="relative w-full aspect-square" style={{ maxWidth: '600px' }}>
          {/* Mode selection overlay */}
          {tutorMode === 'selection' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gray-900 bg-opacity-70 backdrop-blur-sm rounded-lg">
              <div className="flex flex-col space-y-6 w-80">
                <Tooltip content="Custom lessons based on your weaknesses">
                  <Button 
                    variant="primary"
                    size="lg" 
                    fullWidth
                    disabled
                    className="py-6 text-lg font-medium"
                    leftIcon={
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                      </svg>
                    }
                  >
                    Personalized Lesson
                  </Button>
                </Tooltip>
                
                <Tooltip content="Play against an adaptive engine that helps you learn">
                  <Button 
                    variant="secondary"
                    size="lg" 
                    fullWidth
                    onClick={startTutorGame}
                    className="py-6 text-lg font-medium"
                    leftIcon={
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    }
                  >
                    Play Tutor
                  </Button>
                </Tooltip>
              </div>
            </div>
          )}
          
          <div className="absolute top-2 right-2 z-20">
            <div className="relative">
              {tutorMode === 'playing' && (
                <button 
                  ref={menuButtonRef}
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="cursor-pointer bg-gray-800 bg-opacity-60 hover:bg-opacity-80 text-white p-1.5 rounded-full flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              
              {menuOpen && (
                <div 
                  ref={menuRef}
                  className="absolute top-full right-0 mt-1 w-36 bg-gray-800 rounded-md shadow-lg overflow-hidden z-20"
                >
                  <div className="py-1">
                    <button 
                      onClick={() => {
                        flipBoard();
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      Flip Board
                    </button>
                    
                    {canSwitchSides() && (
                    <button 
                      onClick={() => {
                          switchSides();
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                        Switch Sides
                    </button>
                    )}
                    
                    <button 
                      onClick={() => resignGame()}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5L15 7h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      Resign
                    </button>
                    
                    <button 
                      onClick={() => {
                        goToMenu();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Back to Menu
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="w-full h-full">
            {/* 
              The Chess Tutor's adaptive learning system:
              - For player as white: Engine uses regular getBestMove with skill level 0
              - For player as black: Engine uses getEvenMove endpoint to respond to player's moves
              - When player makes a mistake, engine responds with a move that maintains
                relative evaluation instead of maximizing advantage
              - This gives players opportunity to recover and learn from mistakes
              - Skill level 0 (approx. 1350 ELO) makes it suitable for beginners
            */}
            <Chessboard 
              key={`board-${playerSide}-${gameState}-${isGameOver}-${tutorMode}-${boardKey}`}
              fen={fen} 
              onMove={handleMove}
              orientation={orientation}
              playerSide={playerSide}
              skillLevel={0}
              viewOnly={tutorMode === 'selection' || disableBoard}
            />
          </div>
        </div>
        
        {/* Game End Modal */}
        <Modal
          isOpen={showGameEndModal}
          onClose={() => {
            setShowGameEndModal(false);
            setGameState('resetting');
            setNeedsReset(true);
          }}
          title="Game Over"
          size="sm"
          primaryButton={{
            label: "New Game",
            onClick: resetGame,
            variant: "primary"
          }}
          contentClassName="pb-6"
        >
          <div className="flex flex-col items-center space-y-5 py-4">
            {/* Chess piece icon/graphic */}
            <div className="relative w-20 h-20 mb-2">
              {gameStatus.toLowerCase().includes('checkmate') ? (
                // King icon for checkmate
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full text-indigo-400">
                  <path d="M19 22H5v-2h14v2M17.2 8.4c-1-1.2-1.6-2.7-1.8-4.3-.3-1.8-2.9-1.8-3.2 0-.3 1.6-.8 3.1-1.8 4.3-.9 1.1-1.6 2.3-2.1 3.6-.2.6.5 1.2 1.1.9 1.5-.7 2.3-.6 3.4-1.3-.7 1.5-1.1 3.1-1.1 4.8 0 2.1 1.6 1.6 2.4 0 .8 1.6 2.4 2.1 2.4 0 0-1.7-.4-3.3-1.1-4.8 1.1.7 1.9.6 3.4 1.3.6.3 1.3-.2 1.1-.9-.6-1.3-1.3-2.5-2.2-3.6z" />
                </svg>
              ) : gameStatus.toLowerCase().includes('stalemate') || gameStatus.toLowerCase().includes('draw') ? (
                // Two kings for draw/stalemate
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="currentColor" className="w-full h-full text-amber-400">
                  <path d="M406.1 61.65c9.369-9.371 9.369-24.57 0-33.94-9.369-9.371-24.57-9.371-33.94 0L345.9 54.06l-26.34-26.35c-9.369-9.371-24.57-9.371-33.94 0-9.369 9.371-9.369 24.57 0 33.94L312 87.99l-26.34 26.35c-9.369 9.371-9.369 24.57 0 33.94 9.369 9.371 24.57 9.371 33.94 0L345.9 121.9l26.34 26.35c9.369 9.371 24.57 9.371 33.94 0 9.369-9.371 9.369-24.57 0-33.94L379.9 87.99l26.2-26.34zm-278.7 0c9.369-9.371 9.369-24.57 0-33.94-9.369-9.371-24.57-9.371-33.94 0L67.12 54.06l-26.35-26.35c-9.369-9.371-24.57-9.371-33.94 0-9.369 9.371-9.369 24.57 0 33.94L33.18 87.99l-26.35 26.35c-9.369 9.371-9.369 24.57 0 33.94 9.369 9.371 24.57 9.371 33.94 0L67.12 121.9l26.35 26.35c9.369 9.371 24.57 9.371 33.94 0 9.369-9.371 9.369-24.57 0-33.94L101.1 87.99l26.3-26.34zM576 385.1c0-9.181-5.119-16.95-12.72-21.09C613.1 305.5 640 236.4 640 160c0-123.5-100.3-224-223.8-224C323.8 89.43 256 177.6 256 285.6c0 35.58 9.421 69.25 26.72 99.26C276.1 389.1 271 396.7 271 405.9c0 11.71 9.331 21.04 20.95 21.04h304c11.67 0 21.05-9.328 21.05-21.04zm-186.1-235.7l-42.95-62.1s-3.348 .2682-4.42 .2959c-1.143 .0371-5.686 .3066-5.686 .3066l35.04 32.19-18.93 41.02c59.61 .4678 64.95 71.32 64.95 71.32l-111.1 .18c.5078-117.9 83.77-84.63 83.77-84.63zM224 448c-44.18 0-80-35.82-80-80s35.82-80 80-80c.166 0 .332 .002 .4988 .0039l-16.84-15.93c-10.41-9.582-18.64-20.67-24.24-33.64-16.29-37.54-50.68-103.4-103.8-137.4l26.21 88.17c5.07 17.04-4.359 35.2-21.22 40.34-17.03 5.146-34.89-4.416-39.94-21.47l-39.78-133.1c-5.068-17.05 4.359-35.19 21.22-40.34 17.08-5.174 34.98 4.348 40 21.3 8.312 27.95 42.15 60.65 71.11 87.55 41.98 37.84 86.18 78.4 86.18 136.6 0 6.385-.3418 12.37-.9382 18.35 17 5.54 31.7 16.45 41.9 31.11 10.19-14.6 24.92-25.55 41.9-31.11-.5937-5.955-.9273-12.05-.9273-18.37 0-76.93 73.78-125.8 136.1-163l39.31-19.66c-2.157-11.69-3.133-23.75-3.133-36.1 0-108.1 88.31-196.8 196.8-196.8 14.24 0 25.71 11.55 25.71 25.81 0 15.21-13.32 25.8-25.71 25.8-80.14 0-145.3 65.14-145.3 145.3 0 16.38 2.717 32.52 8.141 47.96l41.83-21.07c32.76-19.07 60.53-35.18 89.2-35.18 63.28 0 114.6 51.47 114.6 114.9 0 13.95-2.482 27.29-7.033 39.66 7.568 4.141 12.68 12 12.68 21.03 0 13.48-10.76 24.24-24.24 24.24h-145.4C183.7 448 224 407.7 224 448zM517.6 188.9c-20.95 0-46.7 15.2-74.45 31.69l-76.34 38.35c-45.87 27.23-88.4 58.12-94.72 96.23l263.2-.5059c6.541-45.05-30.7-165.8-17.69-165.8L517.6 188.9z"/>
                </svg>
              ) : (
                // Flag icon for resignation
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full text-red-400">
                  <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z" />
                </svg>
              )}
            </div>

            {/* Game result information */}
            <div className="text-center bg-gray-800 p-4 rounded-lg shadow-inner w-full border border-gray-700">
              <div className="text-2xl font-bold mb-3 text-white">
                {gameStatus.toLowerCase() === 'resignation' ? 'Game Resigned' : gameStatus}
              </div>
              <div className="text-lg text-gray-300">{gameResult}</div>
            </div>
            
            {/* Game save status */}
            <div className="w-full px-2">
              {finalMoveCount < 8 ? (
                <div className="flex items-center justify-center space-x-2 bg-amber-900/30 text-amber-400 p-3 rounded-md">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Game was too short to be saved (minimum 8 moves required).</span>
                </div>
              ) : (
                <div className={`flex items-center justify-center space-x-2 p-3 rounded-md ${gameSaved ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  {gameSaved ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Game saved successfully!</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span>Game could not be saved.</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
}

export default TutorPage; 