import React, { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Config } from 'chessground/config';
import { Chess, Square } from 'chess.js';
import { Color, Key } from 'chessground/types';
import { gameApi } from '../lib/api';

// Update the custom type definition to handle null ref
declare module 'chessground' {
  export function Chessground(element: HTMLElement, config?: any): Api;
}

interface ChessboardProps {
  fen?: string;
  orientation?: Color;
  viewOnly?: boolean;
  onMove?: (from: string, to: string) => void;
  highlightSquares?: string[];
  skillLevel?: number;
}

function Chessboard({
  fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Default starting position
  orientation = 'white',
  viewOnly = false,
  onMove,
  highlightSquares = [],
  skillLevel = 10,
}: ChessboardProps) {
  // DOM reference for chessground
  const boardRef = useRef<HTMLElement | null>(null);
  
  // Store chessground instance in a ref to avoid rerendering
  const chessgroundRef = useRef<Api | null>(null);
  
  // Store chess.js instance in a ref - using version 1.1.0
  const chessRef = useRef<any>(new Chess(fen));
  
  // Track loading state for the thinking indicator
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Flag to track if the board has been initialized
  const hasInitializedRef = useRef(false);
  
  // Store current FEN and orientation in refs to track changes
  const currentFenRef = useRef(fen);
  const currentOrientationRef = useRef(orientation);
  
  // Track position evaluation before player's move
  const previousEvalRef = useRef<number | null>(null);
  const currentEvalRef = useRef<number | null>(null);
  
  // Function to calculate legal moves for the current position
  function calculateDests() {
    const dests = new Map();
    try {
      const chess = chessRef.current;
      
      // Get all possible moves
      const moves = chess.moves({ verbose: true });
      
      // Group moves by source square
      for (const move of moves) {
        if (!dests.has(move.from)) {
          dests.set(move.from, []);
        }
        dests.get(move.from).push(move.to);
      }
    } catch (error: any) {
      console.error("Error calculating legal moves:", error);
    }
    return dests;
  }
  
  // Function to evaluate the current position
  async function evaluatePosition(fen: string) {
    try {
      const response = await gameApi.evaluatePosition(fen, 12); // Use standard depth of 12
      const score = response.score;
      
      // Get the current turn from the FEN string
      const turn = fen.split(' ')[1]; // 'w' for white, 'b' for black
      
      // Normalize the score from the engine's perspective
      // Engine always returns positive scores as good for the side to move
      // We want to normalize to white's perspective: positive = good for white
      return turn === 'b' ? -score : score;
    } catch (error) {
      console.error("Error evaluating position:", error);
      return null;
    }
  }
  
  // Function to make a Stockfish move
  async function makeStockfishMove() {
    // Skip if no chessground or processing another move
    if (!chessgroundRef.current || isProcessing) return;
    
    try {
      setIsProcessing(true);
      const chess = chessRef.current;
      const currentFen = chess.fen();
      
      try {
        let response;
        let evalChange = 0;
        
        // Calculate eval change if we have previous evaluation
        if (previousEvalRef.current !== null && currentEvalRef.current !== null) {
          evalChange = currentEvalRef.current - previousEvalRef.current;
          console.log(`Eval change: ${evalChange} (prev: ${previousEvalRef.current}, current: ${currentEvalRef.current})`);
          
          // For even-move, we need to adjust the eval change
          // from the perspective of the player who just moved
          const playerIsWhite = orientation === 'white';
          const playerJustMoved = chess.turn() === 'b'; // If it's black's turn, white just moved
          
          // If the player is black and just moved, or is white and didn't just move,
          // we need to flip the sign of the eval change
          if ((playerIsWhite && !playerJustMoved) || (!playerIsWhite && playerJustMoved)) {
            evalChange = -evalChange;
          }
          
          // Use even-move endpoint for adaptive response
          response = await gameApi.getEvenMove(currentFen, evalChange, skillLevel);
        } else {
          // Fallback to best-move if we don't have evaluation data
          response = await gameApi.getBestMove(currentFen, skillLevel);
        }
        
        if (response && response.move) {
          const from = response.move.substring(0, 2) as Key;
          const to = response.move.substring(2, 4) as Key;
          
          // Make the move in chess.js
          chess.move({
            from: from as string,
            to: to as string,
            promotion: response.move.length > 4 ? response.move[4] : 'q'
          });
          
          // Update chessground
          const newDests = calculateDests();
          chessgroundRef.current.set({
            fen: chess.fen(),
            turnColor: chess.turn() === 'w' ? 'white' : 'black',
            movable: { dests: newDests },
            lastMove: [from, to],
          });
          
          // Animate the move
          setTimeout(() => {
            if (chessgroundRef.current) {
              chessgroundRef.current.move(from, to);
            }
          }, 50);
          
          // Get the evaluation after engine move
          const postMoveEval = await evaluatePosition(chess.fen());
          previousEvalRef.current = postMoveEval;
        }
      } catch (apiError) {
        console.error("Stockfish API error, using fallback:", apiError);
        
        // Fallback: random legal move
        const legalMoves = chess.moves({ verbose: true });
        if (legalMoves.length > 0 && chessgroundRef.current) {
          const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
          
          // Make move in chess.js
          chess.move({
            from: randomMove.from,
            to: randomMove.to,
            promotion: 'q'
          });
          
          // Update chessground
          const newDests = calculateDests();
          chessgroundRef.current.set({
            fen: chess.fen(),
            turnColor: chess.turn() === 'w' ? 'white' : 'black',
            movable: { dests: newDests },
            lastMove: [randomMove.from as Key, randomMove.to as Key]
          });
          
          // Animate the move
          setTimeout(() => {
            if (chessgroundRef.current) {
              chessgroundRef.current.move(randomMove.from as Key, randomMove.to as Key);
            }
          }, 50);
        }
      }
    } catch (error: any) {
      console.error("Error making Stockfish move:", error);
    } finally {
      setIsProcessing(false);
    }
  }
  
  // Function to handle a user move
  async function handleMove(from: Key, to: Key) {
    try {
      // Store the evaluation before the player's move
      const chess = chessRef.current;
      
      // Store previous evaluation as reference point
      if (previousEvalRef.current !== null) {
        previousEvalRef.current = currentEvalRef.current;
      }
      
      // Try to make the move in chess.js
      const moveResult = chess.move({
        from: from as string,
        to: to as string,
        promotion: 'q' // Always promote to queen for simplicity
      });
      
      if (!moveResult) {
        console.error('Invalid move:', from, to);
        return false;
      }
      
      // Evaluate the position after player's move
      currentEvalRef.current = await evaluatePosition(chess.fen());
      
      // Call onMove callback if provided
      if (onMove) {
        onMove(from as string, to as string);
      }
      
      // Update board position
      if (chessgroundRef.current) {
        const newDests = calculateDests();
        chessgroundRef.current.set({
          fen: chess.fen(),
          turnColor: chess.turn() === 'w' ? 'white' : 'black',
          movable: { dests: newDests },
          lastMove: [from, to]
        });
      }
      
      // Check if game is over
      const isGameOver = chess.isGameOver?.() || false;
      
      // Make computer move if game not over
      if (!isGameOver) {
        setTimeout(() => {
          makeStockfishMove();
        }, 300);
      }
      
      return true;
    } catch (error: any) {
      console.error("Error making move:", error);
      return false;
    }
  }
  
  // Create or update chessground
  function updateChessground() {
    if (!boardRef.current) return;
    
    const chess = chessRef.current;
    
    // Calculate legal moves for the current position
    const dests = calculateDests();
    
    // Configuration for chessground
    const config: Config = {
      fen: chess.fen(),
      orientation: currentOrientationRef.current,
      viewOnly: false,
      coordinates: true,
      movable: {
        free: false,
        color: 'white',
        dests,
        events: {
          after: handleMove
        }
      },
      animation: {
        enabled: true,
        duration: 200
      },
      draggable: {
        enabled: !viewOnly,
        showGhost: true
      },
      selectable: {
        enabled: true
      },
      highlight: {
        lastMove: true,
        check: true
      },
      premovable: {
        enabled: false
      }
    };
    
    try {
      if (!hasInitializedRef.current) {
        // First-time initialization
        const cg = Chessground(boardRef.current, config);
        chessgroundRef.current = cg;
        hasInitializedRef.current = true;
      } else if (chessgroundRef.current) {
        // Update existing instance
        chessgroundRef.current.set(config);
      }
    } catch (err: any) {
      console.error("Error initializing/updating chessground:", err);
      
      // Try to recover by reinitializing
      if (boardRef.current) {
        try {
          if (chessgroundRef.current) {
            chessgroundRef.current.destroy();
          }
          chessgroundRef.current = Chessground(boardRef.current, config);
          hasInitializedRef.current = true;
        } catch (e) {
          console.error("Failed to recover chessboard:", e);
        }
      }
    }
  }
  
  // Initialize board when component mounts or FEN/orientation changes
  useEffect(() => {
    if (!boardRef.current) return;
    
    // Store current values in refs for easier access
    currentFenRef.current = fen;
    currentOrientationRef.current = orientation;
    
    try {
      // Reset chess instance to the new FEN
      const chess = chessRef.current;
      chess.load(fen);
      
      // Create or update the chessground instance
      updateChessground();
      
      // If we're not in viewOnly mode, calculate whose turn it is and set up correctly
      if (!viewOnly) {
        const playerColor = orientation;
        const turnColor = chess.turn() === 'w' ? 'white' : 'black';
        
        // If it's the computer's turn, make a move after a short delay
        if (playerColor !== turnColor && chessgroundRef.current) {
          setTimeout(() => {
            makeStockfishMove();
          }, 500);
        }
      }
    } catch (error: any) {
      console.error("Error initializing board:", error);
    }
    
    // Cleanup on unmount
    return () => {
      if (chessgroundRef.current) {
        chessgroundRef.current.destroy();
        chessgroundRef.current = null;
        hasInitializedRef.current = false;
      }
    };
  }, [fen, orientation, viewOnly]);
  
  // Initialize the evaluation when the board is first set up
  useEffect(() => {
    // Wait briefly for the board to be initialized
    const timer = setTimeout(() => {
      const initEvaluation = async () => {
        try {
          if (!hasInitializedRef.current) return;
          
          const initialEval = await evaluatePosition(chessRef.current.fen());
          previousEvalRef.current = initialEval;
          currentEvalRef.current = initialEval;
          console.log(`Initial position evaluation: ${initialEval}`);
        } catch (error) {
          console.error("Error initializing evaluation:", error);
        }
      };
      
      initEvaluation();
    }, 500); // Give the board time to initialize
    
    return () => clearTimeout(timer);
  }, [hasInitializedRef.current]);
  
  return (
    <div className="w-full h-full relative overflow-hidden" style={{ borderRadius: '8px' }}>
      <div ref={boardRef as any} className="w-full h-full overflow-hidden" style={{ borderRadius: '8px' }} />
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 z-10">
          <div className="text-white text-lg font-bold">Stockfish is thinking...</div>
        </div>
      )}
    </div>
  );
}

export default Chessboard; 