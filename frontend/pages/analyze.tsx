import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import { Chess } from 'chess.js';
import Chessboard from '../components/Chessboard';
import { Button } from '../components/ui';

interface GameData {
  id: string;
  pgn: string;
  white_player?: string;
  black_player?: string;
  result?: string;
  event?: string;
  game_date?: string;
  user_color?: 'white' | 'black';
}

const AnalyzePage = () => {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  
  // Game state
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [currentFen, setCurrentFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [moveIndex, setMoveIndex] = useState(-1);
  const [moves, setMoves] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  
  // Chess.js instance for move parsing
  const chessRef = useRef(new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  
  // Fetch game data when component mounts or gameId changes
  useEffect(() => {
    const fetchGame = async () => {
      if (!session?.user?.id) return;
      
      try {
        // If no gameId provided, fetch most recent game
        const { gameId } = router.query;
        
        const query = supabase
          .from('games')
          .select('*')
          .eq('user_id', session.user.id);
          
        if (gameId) {
          query.eq('id', gameId);
        } else {
          query.order('game_date', { ascending: false })
               .order('created_at', { ascending: false })
               .limit(1);
        }
        
        const { data, error } = await query.single();
        
        if (error) throw error;
        if (!data) {
          console.error('No game found');
          return;
        }
        
        // Set game data
        setGameData(data);
        
        try {
          // Parse PGN and set up initial position
          const chess = new Chess();
          chess.loadPgn(data.pgn);
          
          // Get all moves
          const history = chess.history();
          setMoves(history);
          
          // Reset to starting position
          const startingChess = new Chess();
          setCurrentFen(startingChess.fen());
          setMoveIndex(-1);
          
          // Store the parsed game for later use
          chessRef.current = chess;
          
          // Set board orientation based on user's color
          if (data.user_color) {
            setOrientation(data.user_color);
          }
        } catch (parseError) {
          console.error('Error parsing game:', parseError);
        }
      } catch (error) {
        console.error('Error fetching game:', error);
      }
    };
    
    fetchGame();
  }, [router.query.gameId, session?.user?.id]);
  
  // Navigation functions
  const goToMove = (index: number) => {
    if (index < -1 || index >= moves.length) return;
    
    try {
      // Create a new chess instance for move navigation
      const chess = new Chess();
      
      if (index === -1) {
        // Just show the starting position
        setCurrentFen(chess.fen());
        setMoveIndex(-1);
        return;
      }
      
      // We need to replay all moves up to the current index
      if (gameData?.pgn) {
        chess.loadPgn(gameData.pgn);
        
        // Create a new chess instance for the current position
        const positionChess = new Chess();
        
        // Get all moves with san notation
        const allMoves = chess.history();
        
        // Replay up to the selected index
        for (let i = 0; i <= index; i++) {
          if (i < allMoves.length) {
            positionChess.move(allMoves[i]);
          }
        }
        
        setCurrentFen(positionChess.fen());
        setMoveIndex(index);
      }
    } catch (error) {
      console.error('Error navigating to move:', error);
    }
  };
  
  const goToStart = () => goToMove(-1);
  const goToPrevMove = () => goToMove(moveIndex - 1);
  const goToNextMove = () => goToMove(moveIndex + 1);
  const goToEnd = () => goToMove(moves.length - 1);
  
  const flipBoard = () => {
    setOrientation(prev => prev === 'white' ? 'black' : 'white');
  };
  
  // Format move number (e.g., "1." for white's first move)
  const formatMoveNumber = (index: number) => {
    return `${Math.floor(index / 2) + 1}${index % 2 === 0 ? '.' : '...'}`;
  };
  
  if (!session) {
    return null; // Will redirect to login
  }
  
  return (
    <div className="w-full h-full flex justify-center">
      <div className="max-w-7xl w-full p-4 flex justify-center">
        <div className="flex flex-row items-center gap-4">
          {/* Left side - Chessboard */}
          <div className="flex flex-col items-center">
            <div className="relative" style={{ width: 'min(680px, calc(100vh - 12rem))', height: 'min(680px, calc(100vh - 12rem))' }}>
              {/* Board controls */}
              <div className="absolute top-3 right-3 z-10 flex space-x-2">
                <Button
                  onClick={flipBoard}
                  variant="ghost"
                  size="xs"
                  className="!bg-white !bg-opacity-80 hover:!bg-opacity-100 !text-gray-800 !p-2 !rounded-full"
                  aria-label="Flip Board"
                  leftIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  }
                />
              </div>
              
              {/* Chessboard wrapper with perfect square ratio */}
              <div className="h-full w-full">
                <Chessboard
                  fen={currentFen}
                  orientation={orientation}
                  viewOnly={true}
                />
              </div>
            </div>
            
            {/* Navigation controls */}
            <div className="mt-4 flex justify-center space-x-3">
              <Button
                onClick={goToStart}
                disabled={moveIndex === -1}
                variant="ghost"
                size="sm"
                leftIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                }
              >
                Start
              </Button>
              <Button
                onClick={goToPrevMove}
                disabled={moveIndex === -1}
                variant="ghost"
                size="sm"
                leftIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                }
              >
                Previous
              </Button>
              <Button
                onClick={goToNextMove}
                disabled={moveIndex === moves.length - 1}
                variant="ghost"
                size="sm"
                leftIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                }
              >
                Next
              </Button>
              <Button
                onClick={goToEnd}
                disabled={moveIndex === moves.length - 1}
                variant="ghost"
                size="sm"
                leftIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                }
              >
                End
              </Button>
            </div>
          </div>
          
          {/* Right side - Game info and moves */}
          <div className="w-80 flex flex-col h-[calc(100vh-6rem)]">
            {/* Game information */}
            <div className="bg-gray-800 rounded-lg p-3 mb-2">
              <h2 className="text-base font-semibold text-white mb-1">Game Details</h2>
              <div className="space-y-1 text-sm">
                {gameData?.event && (
                  <div className="truncate">
                    <span className="text-gray-400">Event:</span>
                    <span className="text-gray-200 ml-2">{gameData.event}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-400">Date:</span>
                  <span className="text-gray-200 ml-2">
                    {gameData?.game_date ? new Date(gameData.game_date).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">White:</span>
                  <span className="text-gray-200 ml-2">{gameData?.white_player || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Black:</span>
                  <span className="text-gray-200 ml-2">{gameData?.black_player || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Result:</span>
                  <span className="text-gray-200 ml-2">{gameData?.result || 'Unknown'}</span>
                </div>
              </div>
            </div>
            
            {/* Moves list */}
            <div className="bg-gray-800 rounded-lg p-3 flex-1 overflow-hidden">
              <h2 className="text-base font-semibold text-white mb-1">Moves</h2>
              <div className="h-[calc(100%-2rem)] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-1">
                  {moves.map((move, index) => (
                    <Button
                      key={index}
                      variant={moveIndex === index ? 'secondary' : 'ghost'}
                      size="xs"
                      onClick={() => goToMove(index)}
                      className={`text-left !py-1 !px-2 ${index % 2 === 0 ? 'col-start-1' : 'col-start-2'}`}
                    >
                      <span className="text-gray-400 mr-1 text-xs">{formatMoveNumber(index)}</span>
                      <span className="text-sm">{move}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyzePage; 