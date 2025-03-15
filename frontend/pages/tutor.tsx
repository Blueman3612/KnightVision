import React, { ReactNode, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Chessboard from '@/components/Chessboard';
import { Chess } from 'chess.js';
import Head from 'next/head';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';

interface TutorPageProps {
  children?: ReactNode;
}

function TutorPage() {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const chessRef = useRef(new Chess());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [gameStatus, setGameStatus] = useState<string>('');
  const [fen, setFen] = useState<string>(chessRef.current.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [gameStartTime, setGameStartTime] = useState<Date>(new Date());

  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

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
              'White', orientation === 'white' ? session.user.email : 'Stockfish 0',
              'Black', orientation === 'black' ? session.user.email : 'Stockfish 0',
              'WhiteElo', orientation === 'white' ? '?' : '1350', // Approximate ELO for skill level 0
              'BlackElo', orientation === 'black' ? '?' : '1350',
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
              white_player: orientation === 'white' ? session.user.email : 'Stockfish 0',
              black_player: orientation === 'black' ? session.user.email : 'Stockfish 0',
              white_elo: orientation === 'white' ? null : 1350,
              black_elo: orientation === 'black' ? null : 1350,
              platform: 'Chess Tutor',
              start_time: gameStartTime.toISOString(),
              end_time: new Date().toISOString(),
              termination: inCheckmate ? 'checkmate' : 
                          chessAny.in_stalemate?.() ? 'stalemate' : 
                          chessAny.in_draw?.() ? 'draw' : 'normal',
              unique_game_id: uniqueGameId,
              user_color: orientation
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
  }, [isGameOver, moveHistory, session, orientation, supabase, gameStartTime]);

  const handleMove = (from: string, to: string) => {
    try {
      console.log(`Move handled in tutor page: ${from} to ${to}`);
      
      // The actual move has already been made in the Chessboard component
      // We just need to sync our state with it
      const chess = chessRef.current;
      
      // Get the move in SAN format before updating FEN
      // This might be redundant since the move was already made in Chessboard component,
      // but included for safety
      let lastMoveSan = '';
      try {
        const chessAny = chess as any;
        let moves: any[] = [];
        
        // Different versions of chess.js have different history() implementations
        if (typeof chessAny.history === 'function') {
          // Newer versions of chess.js might require no parameters or different parameters
          try {
            moves = chessAny.history({ verbose: true }) || [];
          } catch (e) {
            // Fallback to non-verbose history if verbose fails
            const moveStrings = chessAny.history() || [];
            moves = moveStrings.map((m: string) => ({ san: m }));
          }
        }
        
        if (moves.length > 0) {
          const lastMove = moves[moves.length - 1];
          // Get the SAN notation directly from the move object or use the string
          if (typeof lastMove === 'object' && lastMove.san) {
            lastMoveSan = lastMove.san;
          } else if (typeof lastMove === 'string') {
            lastMoveSan = lastMove;
          } else {
            // If all else fails, create a simple representation
            lastMoveSan = `Move ${moves.length}`;
          }
          
          // Update move history
          setMoveHistory(prev => [...prev, lastMoveSan]);
        }
      } catch (e) {
        console.error('Error getting move history:', e);
      }
      
      setFen(chess.fen());
      
      // Check game status
      const chessAny = chess as any;
      
      // Check if the game is over using methods available in the chess.js version
      const isCheckmate = typeof chessAny.in_checkmate === 'function' ? chessAny.in_checkmate() : false;
      const isDraw = typeof chessAny.in_draw === 'function' ? chessAny.in_draw() : false;
      const isStalemate = typeof chessAny.in_stalemate === 'function' ? chessAny.in_stalemate() : false;
      const isThreefoldRepetition = typeof chessAny.in_threefold_repetition === 'function' ? chessAny.in_threefold_repetition() : false;
      
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
        } else if (typeof chessAny.insufficient_material === 'function' ? chessAny.insufficient_material() : false) {
          setGameStatus('Draw by insufficient material!');
        }
      } else if (typeof chess.in_check === 'function' && chess.in_check()) {
        setGameStatus('Check!');
      } else {
        setGameStatus('');
      }
    } catch (e) {
      console.error('Error handling move:', e);
    }
  };

  const resetGame = () => {
    console.log('Resetting game');
    const chess = chessRef.current;
    chess.reset();
    setFen(chess.fen());
    setGameStatus('');
    setMoveHistory([]);
    setIsGameOver(false);
    setGameStartTime(new Date());
    toast.success('New game started!');
  };

  const flipBoard = () => {
    console.log(`Flipping board to ${orientation === 'white' ? 'black' : 'white'}`);
    setOrientation(orientation === 'white' ? 'black' : 'white');
  };

  const resignGame = () => {
    const chess = chessRef.current;
    const chessAny = chess as any;
    
    // Set game as over
    setIsGameOver(true);
    
    // Display resignation message
    setGameStatus(`${orientation === 'white' ? 'White' : 'Black'} resigned`);
    
    // This will trigger the saveGame effect
    console.log('Game resigned');
  };

  // State for menu toggle
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  
  // Reference for the hamburger button
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Skip if click was on the button - this is handled by handleButtonClick
      if (menuButtonRef.current && menuButtonRef.current.contains(event.target as Node)) {
        return;
      }
      
      // Close menu when clicking outside
      if (menuOpen) {
        setMenuOpen(false);
      }
    };
    
    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);
    
    // Clean up
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);
  
  // Stop propagation on menu clicks to prevent closing when clicking inside
  const handleMenuClick = (e: any) => {
    e.stopPropagation();
  };

  // Handle button click
  const handleButtonClick = (e: any) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

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
            <div className="relative" onClick={handleMenuClick}>
              <button 
                ref={menuButtonRef}
                onClick={handleButtonClick}
                className="absolute right-1 cursor-pointer bg-gray-800 bg-opacity-60 hover:bg-opacity-80 text-white p-1.5 rounded-full flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              {menuOpen && (
                <div className="absolute top-8 right-1 top-full mt-1 w-36 bg-gray-800 rounded-md shadow-lg overflow-hidden z-20">
                  <div className="py-1">
                    <button 
                      onClick={flipBoard}
                      className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      Flip Board
                    </button>
                    
                    <button 
                      onClick={resetGame}
                      className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      New Game
                    </button>
                    
                    <button 
                      onClick={resignGame}
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
              - Uses the "even-move" endpoint for a more forgiving learning experience
              - Tracks position evaluation before and after player moves
              - When player makes a mistake, engine responds with a move that maintains
                relative evaluation instead of maximizing advantage
              - This gives players opportunity to recover and learn from mistakes
              - Skill level 0 (approx. 1350 ELO) makes it suitable for beginners
            */}
            <Chessboard 
              fen={fen} 
              onMove={handleMove}
              orientation={orientation}
              skillLevel={0} // Set Stockfish to skill level 0
            />
          </div>
        </div>
        
        {gameStatus && (
          <div className="mt-4 px-6 py-3 bg-white bg-opacity-80 backdrop-blur-sm rounded-lg shadow-lg">
            <p className="text-center font-medium text-gray-800">{gameStatus}</p>
          </div>
        )}
        
        {moveHistory.length > 0 && (
          <div className="mt-4 w-full max-w-md px-4 py-3 bg-white bg-opacity-90 backdrop-blur-sm rounded-lg shadow-lg">
            <h3 className="text-center text-gray-700 font-medium mb-2">Move History</h3>
            <div className="overflow-auto max-h-40 p-2">
              <div className="grid grid-cols-2 gap-2">
                {moveHistory.map((move, index) => (
                  <div 
                    key={index} 
                    className={`text-sm ${index % 2 === 0 ? 'text-right pr-3 border-r border-gray-300' : 'text-left pl-3'}`}
                  >
                    {index % 2 === 0 && <span className="text-gray-500 mr-2">{Math.floor(index/2) + 1}.</span>}
                    {move}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default TutorPage; 