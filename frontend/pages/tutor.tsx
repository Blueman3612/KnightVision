import React, { ReactNode, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Chessboard from '@/components/Chessboard';
import { Chess } from 'chess.js';
import Head from 'next/head';
import Button from '../components/ui/Button';
import toast, { Toaster } from 'react-hot-toast';
import { gameApi } from '../lib/api';

interface TutorPageProps {
  children?: ReactNode;
}

function TutorPage() {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const chessRef = useRef(new Chess());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [playerSide, setPlayerSide] = useState<'white' | 'black'>('white');
  const [gameStatus, setGameStatus] = useState<string>('');
  const [fen, setFen] = useState<string>(chessRef.current.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [gameStartTime, setGameStartTime] = useState<Date>(new Date());
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  // Save game when it ends
  useEffect(() => {
    const saveGame = async () => {
      if (isGameOver && moveHistory.length > 0 && session) {
        try {
          // Get the PGN from the chess instance
          const chess = chessRef.current;
          const chessAny = chess as any; // Using any type to handle version differences in chess.js
          
          // Set the headers for the PGN
          if (typeof chessAny.header === 'function') {
            chessAny.header(
              'Event', 'Chess Tutor Game',
              'Site', 'Chess Tutor',
              'Date', new Date().toISOString().split('T')[0],
              'White', playerSide === 'white' ? session.user.email : 'Stockfish 0',
              'Black', playerSide === 'black' ? session.user.email : 'Stockfish 0',
              'WhiteElo', playerSide === 'white' ? '?' : '1350', // Approximate ELO for skill level 0
              'BlackElo', playerSide === 'black' ? '?' : '1350',
              'TimeControl', '-',
              'Result', chessAny.in_checkmate?.() ? (chessAny.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2'
            );
          }

          const pgn = typeof chessAny.pgn === 'function' ? chessAny.pgn() : '';
          const inCheckmate = typeof chessAny.in_checkmate === 'function' ? chessAny.in_checkmate() : false;
          const turn = typeof chessAny.turn === 'function' ? chessAny.turn() : 'w';
          
          const result = inCheckmate 
            ? (turn === 'w' ? '0-1' : '1-0') 
            : '1/2-1/2';
          
          // Generate a unique game ID
          const uniqueGameId = `tutor_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
          
          // Insert the game using the RPC function
          const { data, error } = await supabase.rpc('insert_game', {
            p_pgn: pgn,
            p_result: result
          });
          
          if (error) {
            console.error('Error saving game:', error);
            toast.error('Failed to save your game');
            return;
          }
          
          // Update the game to set cpu = true and other metadata
          const { error: updateError } = await supabase
            .from('games')
            .update({
              cpu: true,
              white_player: playerSide === 'white' ? session.user.email : 'Stockfish 0',
              black_player: playerSide === 'black' ? session.user.email : 'Stockfish 0',
              white_elo: playerSide === 'white' ? null : 1350,
              black_elo: playerSide === 'black' ? null : 1350,
              platform: 'Chess Tutor',
              start_time: gameStartTime.toISOString(),
              end_time: new Date().toISOString(),
              termination: inCheckmate ? 'checkmate' : 
                          chessAny.in_stalemate?.() ? 'stalemate' : 
                          chessAny.in_draw?.() ? 'draw' : 'normal',
              unique_game_id: uniqueGameId,
              user_color: playerSide
            })
            .eq('id', data);
            
          if (updateError) {
            console.error('Error updating game metadata:', updateError);
          } else {
            toast.success('Game saved successfully!');
          }
          
        } catch (error) {
          console.error('Error in game saving process:', error);
          toast.error('An error occurred while saving your game');
        }
      }
    };
    
    saveGame();
  }, [isGameOver, moveHistory, session, playerSide, supabase, gameStartTime]);

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
      setIsGameOver(gameOver);
      
      if (gameOver) {
        if (isCheckmate) {
          setGameStatus('Checkmate!');
        } else if (isDraw) {
          setGameStatus('Draw!');
        } else if (isStalemate) {
          setGameStatus('Stalemate!');
        } else if (isThreefoldRepetition) {
          setGameStatus('Draw by repetition!');
        } else if (typeof chessAny.insufficient_material === 'function' ? 
          chessAny.insufficient_material() : false) {
          setGameStatus('Draw by insufficient material!');
        }
      } else if (typeof chessAny.in_check === 'function' && chessAny.in_check()) {
        setGameStatus('Check!');
      } else {
        setGameStatus('');
      }
    } catch (e) {
      console.error('Error handling move:', e);
    }
  };

  const resetGame = () => {
    const chess = chessRef.current;
    chess.reset();
    setFen(chess.fen());
    setGameStatus('');
    setMoveHistory([]);
    setIsGameOver(false);
    setGameStartTime(new Date());
    toast.success('New game started!');
  };
  
  const canSwitchSides = () => {
    try {
      // Use moveHistory length as our primary indicator
      console.log(`Checking if can switch sides. moveHistory length: ${moveHistory.length}`);
      
      // If game is over, always allow switching
      if (isGameOver) {
        console.log("Game is over, can switch sides");
        return true;
      }
      
      // Check if no moves have been made yet (starting position)
      if (moveHistory.length === 0) {
        console.log("No moves made yet, can switch sides");
        return true;
      }
      
      // Allow switching if only one move has been made, regardless of who's playing
      // This covers both:
      // - When player is white and they just moved
      // - When player is black and computer (white) just moved
      if (moveHistory.length === 1) {
        console.log(`Only one move made (${playerSide} playing) - can switch sides`);
        return true;
      }
      
      // In all other cases, don't allow switching (game has progressed too far)
      console.log(`Game has progressed too far (${moveHistory.length} moves) - cannot switch sides`);
      return false;
    } catch (error) {
      console.error("Error in canSwitchSides:", error);
      return false; // Default to not allowing side switch on error
    }
  };

  const switchSides = () => {
    // First check if we're allowed to switch sides
    if (!canSwitchSides()) {
      console.log("Cannot switch sides at this point in the game");
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
    
    console.log(`Switching sides to play as ${newPlayerSide}`);
    
    // Close the menu first
    setMenuOpen(false);
    
    // First update the state to reflect the new player side for both cases
    setPlayerSide(newPlayerSide);
    setOrientation(newPlayerSide);
    setFen(startingFen);
    setGameStatus('');
    setMoveHistory([]);
    setIsGameOver(false);
    setGameStartTime(new Date());
    
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
    const chess = chessRef.current;
    const chessAny = chess as any;
    
    // Set game as over
    setIsGameOver(true);
    
    // Display resignation message
    setGameStatus(`${playerSide === 'white' ? 'White' : 'Black'} resigned`);
  };
  
  const flipBoard = () => {
    // Simply toggle orientation
    setOrientation(orientation === 'white' ? 'black' : 'white');
    // Don't call setFen() here to avoid resetting the game
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
        <Toaster position="top-center" />
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
                      onClick={() => {
                        resignGame();
                        setMenuOpen(false);
                      }}
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
              key={`board-${playerSide}-${isGameOver ? 'over' : 'playing'}`} // Force remount ONLY when player side changes or game ends
              fen={fen} 
              onMove={handleMove}
              orientation={orientation}
              playerSide={playerSide}
              skillLevel={0} // Set Stockfish to skill level 0
            />
          </div>
        </div>
        
        {gameStatus && (
          <div className="mt-4 px-6 py-3 bg-white bg-opacity-80 backdrop-blur-sm rounded-lg shadow-lg">
            <p className="text-center font-medium text-gray-800">{gameStatus}</p>
          </div>
        )}
      </div>
    </>
  );
}

export default TutorPage; 