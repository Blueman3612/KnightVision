import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import { Chess } from 'chess.js';
import Chessboard from '../components/Chessboard';
import { Button } from '../components/ui';
import { gameApi } from '../lib/api';

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
  
  // Evaluation state
  const [evaluation, setEvaluation] = useState<number | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  // Menu state
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // Chess.js instance for move parsing
  const chessRef = useRef(new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  
  // Fetch evaluation whenever position changes
  useEffect(() => {
    let isMounted = true;
    const getEvaluation = async () => {
      if (!currentFen || !isMounted) return;
      
      console.log('Evaluating FEN:', currentFen);
      const turn = currentFen.split(' ')[1]; // 'w' for white, 'b' for black
      console.log('Turn:', turn);
      
      setIsEvaluating(true);
      try {
        console.log('Calling /evaluate with FEN:', currentFen, 'depth:', 20);
        const response = await gameApi.evaluatePosition(currentFen, 20);
        
        // Don't update state if component unmounted
        if (!isMounted) return;
        
        console.log('Raw evaluation response:', response);
        
        // Check if response has the expected format with numeric score
        // The API returns 'evaluation' field, not 'score'
        if (!response || response.evaluation === undefined || response.evaluation === null) {
          console.error('Invalid response format or missing evaluation:', response);
          setEvaluation(null);
          return;
        }
        
        // Parse score as number if it's a string
        let scoreValue = response.evaluation;
        if (typeof scoreValue === 'string') {
          scoreValue = parseFloat(scoreValue);
          console.log('Parsed string score to number:', scoreValue);
        }
        
        // Validate that we have a valid number
        if (isNaN(scoreValue)) {
          console.error('Score is not a valid number:', response.evaluation);
          setEvaluation(null);
          return;
        }
        
        console.log('Raw score from API:', scoreValue, 'typeof:', typeof scoreValue);
        
        // Stockfish returns score from perspective of side to move
        // We normalize to white's perspective (positive = good for white)
        const normalizedScore = turn === 'b' ? -scoreValue : scoreValue;
        console.log('Normalized score (white perspective):', normalizedScore);
        
        setEvaluation(normalizedScore);
      } catch (error) {
        console.error('Error evaluating position:', error);
        if (isMounted) setEvaluation(null);
      } finally {
        if (isMounted) setIsEvaluating(false);
      }
    };
    
    getEvaluation();
    
    // Cleanup function to prevent state updates after unmount
    return () => { isMounted = false; };
  }, [currentFen]);
  
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
  }, [router.query.gameId, session?.user?.id, supabase]);
  
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
  
  // Format move number (e.g., "1." for white's first move)
  const formatMoveNumber = (index: number) => {
    return `${Math.floor(index / 2) + 1}${index % 2 === 0 ? '.' : '...'}`;
  };
  
  // Calculate evaluation bar height percentage
  const calculateEvalBarHeight = useCallback((eval_score: number | null): number => {
    if (eval_score === null || eval_score === undefined || isNaN(Number(eval_score))) {
      return 50; // Even at 50%
    }
    
    // Ensure we're working with a number
    const numericScore = Number(eval_score);
    
    // Sigmoid-like function to map any evaluation to 0-100 range
    // with center at 0 (50%)
    const maxValue = 5; // At +5.0 or higher, bar will be nearly full
    const normalized = Math.max(-maxValue, Math.min(maxValue, numericScore)) / maxValue;
    
    // Transform to percentage (0-100)
    // Note: we subtract from 100 because in CSS, 0% is bottom of container
    // and we want positive evals to show as white (top)
    const heightPercent = 100 - (normalized * 50 + 50);
    return heightPercent;
  }, []);
  
  // Format evaluation for display
  const formatEvaluation = useCallback((eval_score: number | null): string => {
    if (eval_score === null || eval_score === undefined) return '0.0';
    
    // Ensure we're working with a number
    const numericScore = Number(eval_score);
    
    // Check for NaN
    if (isNaN(numericScore)) {
      console.error('Invalid numeric value for eval_score:', eval_score);
      return '0.0';
    }
    
    // Handle mate scores (extremely large values)
    if (numericScore > 100) return '+M' + Math.ceil((1000 - numericScore) / 100);
    if (numericScore < -100) return '-M' + Math.ceil((1000 + numericScore) / 100);
    
    // Format to one decimal place with + sign for positive values
    const formatted = (numericScore > 0 ? '+' : '') + numericScore.toFixed(1);
    return formatted;
  }, []);
  
  // Add useEffect to respond to orientation changes
  useEffect(() => {
    console.log('Orientation changed (useEffect):', orientation);
    // No other actions needed - just making sure React sees this dependency
  }, [orientation]);
  
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
              <div className="absolute top-2 right-2 z-20">
                <div className="relative">
                  <button 
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="cursor-pointer bg-gray-800 bg-opacity-60 hover:bg-opacity-80 text-white p-1.5 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  
                  {menuOpen && (
                    <div className="absolute top-full right-0 mt-1 w-36 bg-gray-800 rounded-md shadow-lg overflow-hidden z-20">
                      <div className="py-1">
                        <button 
                          onClick={() => {
                            console.log(`Direct menu flip: ${orientation} to ${orientation === 'white' ? 'black' : 'white'}`);
                            setOrientation(orientation === 'white' ? 'black' : 'white');
                            setMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                          </svg>
                          Flip Board
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Evaluation bar - now as absolute overlay with proper spacing */}
              <div 
                className="absolute top-0 bottom-0 w-8 flex flex-col z-10"
                style={{ 
                  left: '-16px', 
                  transform: 'translateX(-100%)',
                  borderRadius: '3px',
                  overflow: 'visible'
                }}
              >
                <div className="relative h-full w-full overflow-hidden rounded-[3px] shadow-sm">
                  {/* Black side (top) */}
                  <div 
                    className="absolute top-0 left-0 right-0 transition-height duration-300 ease-out"
                    style={{ 
                      height: `${calculateEvalBarHeight(evaluation)}%`,
                      background: 'linear-gradient(to bottom, #252525, #3e3e3e)'
                    }}
                  ></div>
                  {/* White side (bottom) */}
                  <div 
                    className="absolute bottom-0 left-0 right-0"
                    style={{
                      height: `${100 - calculateEvalBarHeight(evaluation)}%`,
                      background: 'linear-gradient(to bottom, #ffffff, #d8d8d8)'
                    }}
                  ></div>
                  
                  {/* Divider line between colors */}
                  <div 
                    className="absolute left-0 right-0 h-px bg-gray-400"
                    style={{ 
                      top: `${calculateEvalBarHeight(evaluation)}%`
                    }}
                  ></div>
                </div>
                
                {/* Evaluation number - positioned in the center of the bar */}
                <div 
                  className="absolute flex items-center justify-center text-xs font-medium"
                  style={{
                    left: '50%',
                    top: `${calculateEvalBarHeight(evaluation)}%`,
                    transform: 'translate(-50%, -50%)',
                    height: '18px',
                    minWidth: '36px',
                    paddingLeft: '8px',
                    paddingRight: '8px',
                    background: evaluation !== null && evaluation < 0 ? '#333' : 'white',
                    color: evaluation !== null && evaluation < 0 ? 'white' : '#333',
                    borderRadius: '9px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    zIndex: 20
                  }}
                >
                  {isEvaluating ? (
                    <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
                  ) : (
                    formatEvaluation(evaluation)
                  )}
                </div>
              </div>
              
              {/* Chessboard wrapper */}
              <div className="h-full w-full">
                <Chessboard
                  fen={currentFen}
                  orientation={orientation}
                  playerSide={orientation}
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