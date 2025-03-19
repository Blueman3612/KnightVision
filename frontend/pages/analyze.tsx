import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import NextHead from 'next/head';
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
  analyzed: boolean;
}

interface MoveAnnotation {
  move_number: number;
  move_san: string;
  move_uci: string;
  color: string;
  fen_before: string;
  fen_after: string;
  evaluation_before: number;
  evaluation_after: number;
  evaluation_change: number;
  classification: string;
  is_best_move: boolean;
  is_book_move: boolean;
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
  const [moveAnnotations, setMoveAnnotations] = useState<MoveAnnotation[]>([]);
  
  // Menu state
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  
  // Chess.js instance for move parsing
  const chessRef = useRef(new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  
  // Fetch move annotations for the current game
  useEffect(() => {
    const fetchMoveAnnotations = async () => {
      if (!gameData?.id || !session?.user?.id || !gameData.analyzed) return;
      
      try {
        const { data, error } = await supabase
          .from('move_annotations')
          .select('*')
          .eq('game_id', gameData.id)
          .order('move_number', { ascending: true });
          
        if (error) throw error;
        
        setMoveAnnotations(data || []);
      } catch (error) {
        console.error('Error fetching move annotations:', error);
      }
    };
    
    fetchMoveAnnotations();
  }, [gameData?.id, gameData?.analyzed, session?.user?.id, supabase]);
  
  // Set evaluation based on position and annotations when position changes
  useEffect(() => {
    // If the game hasn't been analyzed, don't try to display evaluations
    if (!gameData?.analyzed || !currentFen) {
      setEvaluation(null);
      return;
    }
    
    // Find the annotation for the current position
    let currentAnnotation = null;
    
    // Special case for starting position (moveIndex = -1)
    if (moveIndex === -1 && moveAnnotations.length > 0) {
      currentAnnotation = moveAnnotations[0];
      setEvaluation(currentAnnotation.evaluation_before);
      return;
    }
    
    // For any other position, find the annotation by FEN
    if (moveIndex >= 0 && moveIndex < moveAnnotations.length) {
      currentAnnotation = moveAnnotations[moveIndex];
      
      if (currentAnnotation) {
        // Use evaluation_after since we're viewing the position after the move
        setEvaluation(currentAnnotation.evaluation_after);
      } else {
        setEvaluation(null);
      }
    } else {
      setEvaluation(null);
    }
  }, [currentFen, moveIndex, moveAnnotations, gameData?.analyzed]);
  
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
              
              {/* Evaluation bar - only display if game has been analyzed */}
              {gameData?.analyzed && (
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
                    {formatEvaluation(evaluation)}
                  </div>
                </div>
              )}
              
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
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 mb-3 shadow-md">
              <div className="space-y-2 text-sm">
                {gameData?.event && (
                  <div className="flex items-center truncate">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                    <span className="text-gray-400">Event:</span>
                    <span className="text-gray-200 ml-2 font-medium truncate">{gameData.event}</span>
                  </div>
                )}
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-400">Date:</span>
                  <span className="text-gray-200 ml-2 font-medium">
                    {gameData?.game_date ? new Date(gameData.game_date).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-gray-400">White:</span>
                  <span className="text-gray-200 ml-2 font-medium">{gameData?.white_player || 'Unknown'}</span>
                </div>
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-gray-400">Black:</span>
                  <span className="text-gray-200 ml-2 font-medium">{gameData?.black_player || 'Unknown'}</span>
                </div>
                {!gameData?.analyzed && (
                  <div className="flex items-center mt-3 py-2 px-3 bg-amber-900/30 rounded-md border border-amber-800/50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-400 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-amber-400 text-xs">This game hasn't been analyzed yet.</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Moves list */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 flex-1 overflow-hidden shadow-md">
              <div className="h-full flex flex-col">
                <div 
                  className="flex-1 overflow-y-auto pr-2"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(71, 85, 105, 0.5) rgba(15, 23, 42, 0.3)',
                    msOverflowStyle: 'none' // For Internet Explorer and Edge
                  }}
                >
                  <div className="grid grid-cols-2 gap-1.5">
                    {moves.map((move, index) => (
                      <Button
                        key={index}
                        variant={moveIndex === index ? 'secondary' : 'ghost'}
                        size="xs"
                        onClick={() => goToMove(index)}
                        className={`
                          text-left !py-1.5 !px-2.5 rounded-md transition-all duration-200
                          ${moveIndex === index 
                            ? '!bg-blue-600 hover:!bg-blue-700 shadow-sm' 
                            : 'hover:!bg-gray-700/80'}
                          ${index % 2 === 0 ? 'col-start-1' : 'col-start-2'}
                        `}
                      >
                        <span className={`mr-1.5 text-xs font-medium ${moveIndex === index ? 'text-blue-200' : 'text-gray-400'}`}>
                          {formatMoveNumber(index)}
                        </span>
                        <span className={`text-sm ${moveIndex === index ? 'font-medium' : ''}`}>{move}</span>
                      </Button>
                    ))}
                  </div>
                </div>
                
                {/* Result at bottom of moves panel */}
                {gameData?.result && (
                  <div 
                    className={`
                      flex items-center justify-center mt-3 pt-3 pb-3 border-t border-gray-700 rounded-b-md
                    `}
                    style={{
                      background: gameData.result === '1-0' 
                        ? 'linear-gradient(90deg, rgba(30, 41, 59, 0.7) 0%, rgba(255, 255, 255, 0.25) 50%, rgba(30, 41, 59, 0.7) 100%)'
                        : gameData.result === '0-1'
                        ? 'linear-gradient(90deg, rgba(30, 41, 59, 0.7) 0%, rgba(0, 0, 0, 0.35) 50%, rgba(30, 41, 59, 0.7) 100%)'
                        : 'transparent'
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                    <span className="text-gray-400 mr-2">Result:</span>
                    <span 
                      className="font-medium rounded-md px-2 py-0.5"
                      style={{
                        color: gameData.result === '1-0' ? 'white' : 
                               gameData.result === '0-1' ? 'white' : 
                               'rgb(229, 231, 235)',
                        background: gameData.result === '1-0' ? 'rgba(255, 255, 255, 0.2)' :
                                   gameData.result === '0-1' ? 'rgba(0, 0, 0, 0.4)' :
                                   'transparent'
                      }}
                    >
                      {gameData.result}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const customStyles = `
  /* This adds custom scrollbars to the html and body elements */
  html::-webkit-scrollbar, body::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  
  html::-webkit-scrollbar-track, body::-webkit-scrollbar-track {
    background: rgba(15, 23, 42, 0.3);
    border-radius: 3px;
  }
  
  html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb {
    background: rgba(71, 85, 105, 0.5);
    border-radius: 3px;
    border: none;
  }
  
  html::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover {
    background: rgba(100, 116, 139, 0.7);
  }
  
  html::-webkit-scrollbar-button, body::-webkit-scrollbar-button {
    display: none;
  }
  
  html, body {
    scrollbar-width: thin;
    scrollbar-color: rgba(71, 85, 105, 0.5) rgba(15, 23, 42, 0.3);
  }
`;

export default AnalyzePage;

export function Head() {
  return (
    <>
      <style>{customStyles}</style>
    </>
  );
} 