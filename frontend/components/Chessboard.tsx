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
  playerSide?: Color; // Side that the human player plays as
  viewOnly?: boolean;
  onMove?: (from: string, to: string) => void;
  highlightSquares?: string[];
  skillLevel?: number;
}

function Chessboard({
  fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Default starting position
  orientation = 'white',
  playerSide = 'white', // Default player side is white
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
  // Create a stable ref that won't change with renders
  const chessRef = useRef<any>(null);
  
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
  
  // Utility to safely update evaluation references
  const updateEvaluation = async (fen: string, target: { current: number | null }) => {
    if (!fen) {
      console.error("Cannot update evaluation: FEN is null or empty");
      target.current = 0;
      return 0;
    }
    
    try {
      console.log(`Updating evaluation for position: ${fen}`);
      const eval_score = await evaluatePosition(fen);
      
      console.log(`Received evaluation score: ${eval_score}`);
      
      if (eval_score !== null) {
        // Make sure we have a finite number
        const safeScore = isFinite(eval_score) ? eval_score : 0;
        target.current = safeScore;
        return safeScore;
      } else {
        console.error("Evaluation returned null or undefined");
        target.current = 0;
        return 0;
      }
    } catch (error) {
      console.error("Error updating evaluation:", error);
      // Set a safe default
      target.current = 0;
      return 0;
    }
  };
  
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
      
      // Log the full response to debug
      console.log("Evaluation response:", response);
      
      // The API returns 'evaluation', not 'score'
      const score = response.evaluation;
      
      // Validate that score is a number
      if (score === undefined || score === null || isNaN(score)) {
        console.error("Invalid score from evaluation:", score);
        return 0; // Return a safe default
      }
      
      // Get the current turn from the FEN string
      const turn = fen.split(' ')[1]; // 'w' for white, 'b' for black
      
      // Normalize the score from the engine's perspective
      // Engine always returns positive scores as good for the side to move
      // We want to normalize to white's perspective: positive = good for white
      return turn === 'b' ? -score : score;
    } catch (error) {
      console.error("Error evaluating position:", error);
      return 0; // Return 0 instead of null to avoid NaN in calculations
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
          // Verify we're not using stale data - previousEvalRef should represent the eval
          // after the computer's last move and before the player's move
          evalChange = currentEvalRef.current - previousEvalRef.current;
          console.log(`Eval change: ${evalChange} (prev: ${previousEvalRef.current}, current: ${currentEvalRef.current})`);
          
          // Validate that evalChange is a proper number before proceeding
          if (isNaN(evalChange) || !isFinite(evalChange)) {
            console.error("Invalid eval change detected:", evalChange);
            evalChange = 0; // Use a safe default value
          }
          
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
          
          // Get the evaluation after engine move - this will be the reference point
          // BEFORE the player's next move
          await updateEvaluation(chess.fen(), previousEvalRef);
          console.log("Position evaluation after computer move:", previousEvalRef.current);
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
      console.log("Player move:", from, "to", to);
      
      // IMPORTANT: previousEvalRef holds the evaluation BEFORE player's move
      // It should not be updated here, as it's already set after computer's move
      
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
      
      // Evaluate the position after player's move - this will be compared to previousEvalRef
      // to determine how much the position changed due to player's move
      await updateEvaluation(chess.fen(), currentEvalRef);
      console.log("New evaluation after player move:", currentEvalRef.current);
      
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
    if (!boardRef.current || !chessRef.current) return;
    
    // Get the current FEN directly from the chess instance
    // This ensures we're using the most up-to-date state
    const currentFen = chessRef.current.fen();
    
    // Calculate legal moves for the current position
    const dests = calculateDests();
    
    // Configuration for chessground
    const config: Config = {
      fen: currentFen, // Use the current FEN from chess instance, not the ref
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
        console.log('First-time initialization of chessground');
        const cg = Chessground(boardRef.current, config);
        chessgroundRef.current = cg;
        hasInitializedRef.current = true;
      } else if (chessgroundRef.current) {
        // Update existing instance - avoid full reset if possible
        // Only update the specific properties that need to change
        if (currentOrientationRef.current !== chessgroundRef.current.state.orientation) {
          console.log('Updating chessground orientation to:', currentOrientationRef.current);
          chessgroundRef.current.set({ orientation: currentOrientationRef.current });
        }
        
        // Always update the position and legal moves
        chessgroundRef.current.set({ 
          fen: currentFen,
          turnColor: chessRef.current.turn() === 'w' ? 'white' : 'black',
          movable: { dests }
        });
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
    
    console.log('Chessboard component received update. Orientation:', orientation, 'FEN:', fen);
    
    // Ensure we have a chess instance
    if (!chessRef.current) {
      console.log('Chess instance not initialized yet, creating with FEN:', fen);
      chessRef.current = new Chess(fen);
      // In this case, we'll need a fresh initialization
      hasInitializedRef.current = false;
    }
    
    // Store orientation in ref for easier access
    currentOrientationRef.current = orientation;
    
    try {
      // Get the current position from our chess instance
      const currentPosition = chessRef.current.fen();
      
      // Only update the FEN if it actually changed from what our chess instance has
      // This prevents resetting the board when only the orientation changes
      if (currentPosition !== fen && fen !== currentFenRef.current) {
        console.log('Actual FEN changed, reloading chess instance');
        currentFenRef.current = fen;
        chessRef.current.load(fen);
      } else if (orientation !== currentOrientationRef.current) {
        console.log('Only orientation changed, preserving current game state');
        currentFenRef.current = currentPosition; // Ensure ref is in sync with actual state
      }
      
      // Create or update the chessground instance
      updateChessground();
      
      // If we're not in viewOnly mode, calculate whose turn it is and set up correctly
      if (!viewOnly) {
        const playerColor = playerSide; // Use playerSide instead of orientation
        const turnColor = chessRef.current.turn() === 'w' ? 'white' : 'black';
        
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
  }, [fen, orientation, playerSide, viewOnly]);
  
  // Initialize the chess instance once only - must run before any other effects
  useEffect(() => {
    if (!chessRef.current) {
      console.log('Creating chess instance with FEN:', fen);
      // Create the chess instance
      chessRef.current = new Chess(fen);
    }
  }, []);
  
  // Initialize the evaluation when the board is first set up
  useEffect(() => {
    // Only run this if the board is initialized AND we have a chess instance
    if (!hasInitializedRef.current && chessRef.current) {
      updateChessground();
      hasInitializedRef.current = true;
      
      // Initialize evaluation references
      const initEvaluation = async () => {
        try {
          // Make sure chess instance exists before trying to access fen
          if (!chessRef.current) {
            console.error("Chess instance is null during evaluation init");
            previousEvalRef.current = 0;
            currentEvalRef.current = 0;
            return;
          }
          
          // Set both references to the same initial evaluation
          await updateEvaluation(chessRef.current.fen(), previousEvalRef);
          currentEvalRef.current = previousEvalRef.current;
          
          console.log("Evaluation tracking initialized - both refs set to:", previousEvalRef.current);
        } catch (error) {
          console.error("Error initializing evaluation:", error);
          // Set safe defaults
          previousEvalRef.current = 0;
          currentEvalRef.current = 0;
        }
      };
      
      initEvaluation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
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