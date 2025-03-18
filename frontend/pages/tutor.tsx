import React, { ReactNode, useEffect, useState, useRef, useReducer } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Chessboard from '@/components/Chessboard';
import { Chess } from 'chess.js';
import Head from 'next/head';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui';
import { gameApi } from '../lib/api';

interface TutorPageProps {
  children?: ReactNode;
}

// Define game state machine types
type GameState = 'playing' | 'saving' | 'resetting' | 'ready';

type GameAction = 
  | { type: 'RESIGN'; color: string }
  | { type: 'SAVE_COMPLETE' }
  | { type: 'RESET_COMPLETE' }
  | { type: 'NEW_GAME' };

interface GameStateContext {
  status: GameState;
  gameStatus: string;
  isGameOver: boolean;
  disableBoard: boolean;
  needsReset: boolean;
}

// Reducer for game state machine
function gameStateReducer(state: GameStateContext, action: GameAction): GameStateContext {
  switch (action.type) {
    case 'RESIGN':
      // Player has resigned, start save process
      return {
        ...state,
        status: 'saving',
        gameStatus: `${action.color} resigned`,
        isGameOver: true,
        disableBoard: true,
        needsReset: false
      };
    
    case 'SAVE_COMPLETE':
      // Game is saved, now reset
      return {
        ...state,
        status: 'resetting',
        needsReset: true
      };
      
    case 'RESET_COMPLETE':
      // Reset is complete, ready for new game
      return {
        ...state,
        status: 'ready',
        gameStatus: '',
        isGameOver: false,
        disableBoard: false,
        needsReset: false
      };
      
    case 'NEW_GAME':
      // Start a new game
      return {
        status: 'playing',
        gameStatus: '',
        isGameOver: false,
        disableBoard: false,
        needsReset: false
      };
      
    default:
      return state;
  }
}

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
  
  // Initialize game state machine
  const [gameStateContext, dispatchGameState] = useReducer(gameStateReducer, {
    status: 'playing',
    gameStatus: '',
    isGameOver: false,
    disableBoard: false,
    needsReset: false
  });

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
    if (gameStateContext.status === 'resetting' && gameStateContext.needsReset) {
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
      
      // Notify state machine that reset is complete
      dispatchGameState({ type: 'RESET_COMPLETE' });
    }
  }, [gameStateContext.status, gameStateContext.needsReset]);

  // Save game when it ends
  useEffect(() => {
    const saveGame = async () => {
      if (gameStateContext.isGameOver && moveHistory.length > 0 && session) {
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
          console.log("Using display name from database:", userName);
          
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
          const isResignation = gameStateContext.gameStatus.toLowerCase().includes('resign');
          
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
            // The gameStatus will be set in the resignGame function
            // "White resigned" or "Black resigned"
            result = gameStateContext.gameStatus.toLowerCase().includes('white') ? '0-1' : '1-0';
            terminationReason = 'resignation';
            terminationText = gameStateContext.gameStatus;
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
          console.log("Generated PGN:", pgn); // Debug log to check if moves are included
          
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
            console.log('Game already exists in database, not saving duplicate');
            dispatchGameState({ type: 'SAVE_COMPLETE' });
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
              dispatchGameState({ type: 'SAVE_COMPLETE' });
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
            dispatchGameState({ type: 'SAVE_COMPLETE' });
          } else {
            toast.success('Game saved successfully!');
            dispatchGameState({ type: 'SAVE_COMPLETE' });
          }
          } else {
            toast.success('Game saved successfully!');
            dispatchGameState({ type: 'SAVE_COMPLETE' });
          }
        } catch (error) {
          console.error('Error in game saving process:', error);
          toast.error('An error occurred while saving your game');
          // Even on error, we need to complete the save process
          dispatchGameState({ type: 'SAVE_COMPLETE' });
        }
      }
    };
    
    // Only call saveGame when state is 'saving'
    if (gameStateContext.status === 'saving') {
      saveGame();
    }
  }, [gameStateContext.status, gameStateContext.isGameOver, gameStateContext.gameStatus, moveHistory, session, playerSide, supabase, gameStartTime, toast]);

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
        // Update game state through state machine
        let gameStatus = '';
        if (isCheckmate) {
          gameStatus = 'Checkmate!';
        } else if (isDraw) {
          gameStatus = 'Draw!';
        } else if (isStalemate) {
          gameStatus = 'Stalemate!';
        } else if (isThreefoldRepetition) {
          gameStatus = 'Draw by repetition!';
        } else if (typeof chessAny.insufficient_material === 'function' ? 
          chessAny.insufficient_material() : false) {
          gameStatus = 'Draw by insufficient material!';
        }
        
        // Manually update the state context
        dispatchGameState({ 
          type: 'RESIGN', 
          color: gameStatus 
        });
      } else if (typeof chessAny.in_check === 'function' && chessAny.in_check()) {
        // In check but game not over
        dispatchGameState({ type: 'NEW_GAME' }); // Reset to playing state
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
    dispatchGameState({ type: 'NEW_GAME' });
    toast.success('New game started!');
  };
  
  const canSwitchSides = () => {
    try {
      // Use moveHistory length as our primary indicator
      
      // If game is over, always allow switching
      if (gameStateContext.isGameOver) {
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
    dispatchGameState({ type: 'NEW_GAME' });
    
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

  const resignGame = () => {
    // Trigger the resignation through state machine
    const resignedColor = playerSide === 'white' ? 'White' : 'Black';
    dispatchGameState({ type: 'RESIGN', color: `${resignedColor} resigned` });
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
        <title>Chess Tutor</title>
      </Head>
      <div className="w-full max-w-3xl flex flex-col items-center justify-center">
        <div className="relative w-full aspect-square" style={{ maxWidth: '600px' }}>
          <div className="absolute top-2 right-2 z-20">
            <div className="relative">
              <button 
                ref={menuButtonRef}
                onClick={() => setMenuOpen(!menuOpen)}
                className="cursor-pointer bg-gray-800 bg-opacity-60 hover:bg-opacity-80 text-white p-1.5 rounded-full flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              {menuOpen && (
                <div 
                  ref={menuRef}
                  className="absolute top-full right-0 mt-1 w-36 bg-gray-800 rounded-md shadow-lg overflow-hidden z-20"
                >
                  <div className="py-1">
                    <button 
                      onClick={() => {
                        // IMPORTANT: Do NOT get the current position from the chess instance here
                        // Only change the visual orientation, not the player's side
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
              key={`board-${playerSide}-${gameStateContext.status}-${boardKey}`}
              fen={fen} 
              onMove={handleMove}
              orientation={orientation}
              playerSide={playerSide}
              skillLevel={0}
              viewOnly={gameStateContext.disableBoard}
            />
          </div>
        </div>
        
        {gameStateContext.gameStatus && (
          <div className="mt-4 px-6 py-3 bg-white bg-opacity-80 backdrop-blur-sm rounded-lg shadow-lg">
            <p className="text-center font-medium text-gray-800">{gameStateContext.gameStatus}</p>
          </div>
        )}
      </div>
    </>
  );
}

export default TutorPage; 