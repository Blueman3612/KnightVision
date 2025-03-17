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
      const eval_score = await evaluatePosition(fen);
      
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
      
      console.log("Computer attempting to make a move. Current FEN:", currentFen);
      
      // List of possible moves in the current position
      const legalMoves = chess.moves({ verbose: true });
      if (legalMoves.length === 0) {
        console.log("No legal moves available");
        setIsProcessing(false);
        return;
      }
      
      // The actual move to be played
      let moveFrom = '';
      let moveTo = '';
      let movePromotion = 'q'; // Default to queen promotion
      
      // Special handling for the first move (e2-e4) when in starting position
      const isStartingPosition = currentFen.includes('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
      if (isStartingPosition) {
        // Just make e4 as white's first move - simple and reliable
        moveFrom = 'e2';
        moveTo = 'e4';
        console.log("Using standard opening e4");
      } else {
        // Try to get a move from the API with error handling
        try {
          const response = await gameApi.getBestMove(currentFen, skillLevel);
          
          if (response && response.move && response.move.length >= 4) {
            moveFrom = response.move.substring(0, 2);
            moveTo = response.move.substring(2, 4);
            if (response.move.length > 4) {
              movePromotion = response.move[4];
            }
            console.log("API suggested move:", moveFrom, "to", moveTo);
          } else {
            throw new Error("Invalid response from API");
          }
        } catch (apiError) {
          console.error("API error, using random move:", apiError);
          // Pick a random legal move as fallback
          const randomIndex = Math.floor(Math.random() * legalMoves.length);
          const randomMove = legalMoves[randomIndex];
          moveFrom = randomMove.from;
          moveTo = randomMove.to;
          console.log("Using random fallback move:", moveFrom, "to", moveTo);
        }
      }
      
      // Double-check the move is valid before attempting it
      if (!legalMoves.some((m: any) => m.from === moveFrom && m.to === moveTo)) {
        console.error(`Move ${moveFrom}-${moveTo} is not in the list of legal moves`);
        
        // Use a random legal move if the selected move is invalid
        const randomIndex = Math.floor(Math.random() * legalMoves.length);
        const randomMove = legalMoves[randomIndex];
        moveFrom = randomMove.from;
        moveTo = randomMove.to;
        console.log("Selected move was invalid, using random move instead:", moveFrom, "to", moveTo);
      }
      
      // Make the move in chess.js
      try {
        const result = chess.move({
          from: moveFrom,
          to: moveTo,
          promotion: movePromotion
        });
        
        if (!result) {
          throw new Error(`Invalid move: ${moveFrom} to ${moveTo}`);
        }
        
        // Get the updated FEN to pass to parent
        const updatedFen = chess.fen();
        
        // Update the chessground display
        if (chessgroundRef.current) {
          const newDests = calculateDests();
          const turnColor = chess.turn() === 'w' ? 'white' : 'black';
          const canPlayerMove = turnColor === playerSide;
          
          chessgroundRef.current.set({
            fen: updatedFen,
            turnColor: turnColor,
            lastMove: [moveFrom as Key, moveTo as Key],
            movable: {
              color: playerSide,
              dests: canPlayerMove ? newDests : new Map()
            }
          });
        }
        
        // Call onMove callback with the computer's move to keep parent in sync
        if (onMove) {
          onMove(moveFrom, moveTo);
        }
      } catch (moveError) {
        console.error("Error making move:", moveError);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error in makeStockfishMove function:", error);
    } finally {
      setIsProcessing(false);
    }
  }
  
  // Function to handle a user move
  async function handleMove(from: Key, to: Key) {
    try {
      // Store the evaluation before the player's move
      const chess = chessRef.current;
      
      // Log what's happening for debugging
      console.log(`Player (${playerSide}) attempting move from ${from} to ${to}`);
      
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
      
      // Get the updated FEN after the move for synchronization
      const updatedFen = chess.fen();
      console.log(`Move successful: ${moveResult.san}, new position: ${updatedFen}`);
      
      // Evaluate the position after player's move - this will be compared to previousEvalRef
      // to determine how much the position changed due to player's move
      await updateEvaluation(updatedFen, currentEvalRef);
      
      // Call onMove callback if provided - pass along the updated FEN
      if (onMove) {
        // It's critical we pass the current FEN so the parent can stay in sync
        onMove(from as string, to as string);
      }
      
      // Update board position
      if (chessgroundRef.current) {
        const newDests = calculateDests();
        const turnColor = chess.turn() === 'w' ? 'white' : 'black';
        const canMove = turnColor === playerSide;
        
        chessgroundRef.current.set({
          fen: updatedFen,
          turnColor: turnColor,
          movable: { 
            color: playerSide,
            dests: canMove ? newDests : new Map() 
          },
          lastMove: [from, to]
        });
      }
      
      // Check if game is over
      const isGameOver = chess.isGameOver?.() || false;
      
      // Make computer move if game not over and it's computer's turn
      if (!isGameOver && chess.turn() === (playerSide === 'white' ? 'b' : 'w')) {
        console.log("Player move complete, computer's turn next");
        setTimeout(() => {
          makeStockfishMove();
        }, 300);
      } else {
        console.log("Player move complete, waiting for next player move");
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
    
    console.log("Updating chessground with playerSide:", playerSide);
    
    // Get the current FEN directly from the chess instance
    // This ensures we're using the most up-to-date state
    const currentFen = chessRef.current.fen();
    
    // Calculate legal moves for the current position
    const dests = calculateDests();
    
    // Get the current turn from chess.js
    const turnColor = chessRef.current.turn() === 'w' ? 'white' : 'black';
    
    // Determine if the current player should be able to move
    // Only allow moves if it's the player's turn
    const canMove = turnColor === playerSide;
    console.log("Can player move:", canMove, "Turn:", turnColor, "PlayerSide:", playerSide);
    
    // Configuration for chessground
    const config: Config = {
      fen: currentFen, // Use the current FEN from chess instance, not the ref
      orientation: currentOrientationRef.current,
      viewOnly: false,
      coordinates: true,
      movable: {
        free: false,
        color: playerSide, // Use playerSide instead of hardcoded 'white'
        dests: canMove ? dests : new Map(), // Only provide legal moves if it's player's turn
        events: {
          after: handleMove
        }
      },
      animation: {
        enabled: true,
        duration: 200
      },
      draggable: {
        enabled: !viewOnly && canMove, // Only enable dragging when it's player's turn
        showGhost: true
      },
      selectable: {
        enabled: !viewOnly && canMove // Only enable selection when it's player's turn
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
        console.log("Initializing new chessground with config:", {
          fen: config.fen,
          orientation: config.orientation,
          playerSide: playerSide,
          movableColor: config.movable?.color || playerSide,
          canMove: canMove,
          turnColor: turnColor
        });
        
        const cg = Chessground(boardRef.current, config);
        chessgroundRef.current = cg;
        hasInitializedRef.current = true;
      } else if (chessgroundRef.current) {
        // Update existing instance - avoid full reset if possible
        // Only update the specific properties that need to change
        if (currentOrientationRef.current !== chessgroundRef.current.state.orientation) {
          chessgroundRef.current.set({ orientation: currentOrientationRef.current });
        }
        
        // Always update the position and legal moves
        const updatedMovable = {
          color: playerSide,
          dests: canMove ? dests : new Map(),
        };
        
        console.log("Updating existing chessground:", {
          fen: currentFen,
          turnColor: turnColor,
          movable: updatedMovable,
          playerSide: playerSide,
          canMove: canMove
        });
        
        chessgroundRef.current.set({ 
          fen: currentFen,
          turnColor: turnColor,
          movable: updatedMovable,
          draggable: { enabled: !viewOnly && canMove },
          selectable: { enabled: !viewOnly && canMove }
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
  
  // Debug component mounting
  useEffect(() => {
    console.log("Chessboard mounted/updated with props:", {
      fen,
      orientation,
      playerSide,
      viewOnly,
    });
    
    return () => {
      console.log("Chessboard unmounting");
    };
  }, [fen, orientation, playerSide, viewOnly]);

  // Initialize board when component mounts or FEN/orientation changes
  useEffect(() => {
    console.log("Board initialization effect triggered", {
      fen,
      orientation,
      playerSide,
      viewOnly
    });
    
    if (!boardRef.current) return;
    
    // Ensure we have a chess instance
    if (!chessRef.current) {
      chessRef.current = new Chess(fen);
      // In this case, we'll need a fresh initialization
      hasInitializedRef.current = false;
    } else {
      // If we already have a chess instance, make sure it reflects the current FEN
      if (chessRef.current.fen() !== fen) {
        chessRef.current.load(fen);
      }
    }
    
    // Store orientation in ref for easier access
    currentOrientationRef.current = orientation;
    currentFenRef.current = fen;
    
    try {
      // Create or update the chessground instance
      updateChessground();
      
      // Determine whose turn it is now
      const chess = chessRef.current;
      const turnColor = chess.turn() === 'w' ? 'white' : 'black';
      const isPlayerTurn = turnColor === playerSide;
      
      console.log("Board initialized with turn:", {
        turnColor,
        playerSide,
        isPlayerTurn,
        viewOnly
      });
      
      // If we're not in viewOnly mode and it's computer's turn, initiate a move
      if (!viewOnly && !isPlayerTurn && chessgroundRef.current) {
        // Make sure we don't make computer moves when switching sides
        // and the player is controlling both sides
        const isStartingPosition = fen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        
        // If it's not starting position and it's computer's turn, make a move
        if (!isStartingPosition) {
          console.log("Computer's turn to move");
          setTimeout(() => {
            makeStockfishMove();
          }, 500);
        } else {
          console.log("Starting position - waiting for first player move");
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