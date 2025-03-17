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
  
  // Flag to track if evaluation has been initialized
  const hasInitializedEvaluationRef = useRef(false);
  
  // Store current FEN and orientation in refs to track changes
  const currentFenRef = useRef(fen);
  const currentOrientationRef = useRef(orientation);
  
  // Keep track of the previous playerSide to detect changes
  const previousPlayerSideRef = useRef(playerSide);
  
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
    
    if (!chessRef.current) {
      console.error("Chess instance is null in calculateDests");
      return dests;
    }
    
    try {
      const chess = chessRef.current;
      
      // Get all possible moves
      const moves = chess.moves({ verbose: true });
      
      if (!moves) {
        console.error("Unable to get moves from chess instance");
        return dests;
      }
      
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
      
      // Ensure chess instance exists
      if (!chessRef.current) {
        console.error("Chess instance is null in makeStockfishMove");
        setIsProcessing(false);
        return;
      }
      
      const chess = chessRef.current;
      
      // Safely get current FEN
      let currentFen;
      try {
        currentFen = chess.fen();
      } catch (error) {
        console.error("Error getting FEN:", error);
        setIsProcessing(false);
        return;
      }
      
      // Determine which color the computer is playing as (opposite of player)
      const computerColor = playerSide === 'white' ? 'black' : 'white';
      console.log(`Computer is playing as ${computerColor}, player is ${playerSide}`);
      console.log(`Making Stockfish move with position FEN=${currentFen}`);
      
      // Safely get legal moves
      let legalMoves;
      try {
        legalMoves = chess.moves({ verbose: true });
      } catch (error) {
        console.error("Error getting legal moves:", error);
        setIsProcessing(false);
        return;
      }
      
      if (!legalMoves || legalMoves.length === 0) {
        console.log("No legal moves available");
        setIsProcessing(false);
        return;
      }
      
      // The actual move to be played
      let moveFrom = '';
      let moveTo = '';
      let movePromotion = 'q'; // Default to queen promotion
      
        // Try to get a move from the API with error handling
        try {
        let response;
        const isStartingPosition = currentFen.includes('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
        
        // IMPORTANT: We only use getBestMove for the very first move as white when player is black
        if (isStartingPosition && playerSide === 'black') {
          console.log("Using regular getBestMove API for white's first move (starting position)");
          response = await gameApi.getBestMove(currentFen, skillLevel);
        } else {
          // Calculate the evaluation change from previous to current
          let rawEvalChange = (previousEvalRef.current !== null && currentEvalRef.current !== null) 
            ? currentEvalRef.current - previousEvalRef.current 
            : 0;
          
          // IMPORTANT: Flip the sign of eval_change when the player is black
          // The API expects the eval_change from the computer's perspective
          // Since evaluations are from white's perspective, we need to flip when player is black
          const evalChange = playerSide === 'black' ? -rawEvalChange : rawEvalChange;
          
          console.log(`Raw eval change: ${rawEvalChange.toFixed(2)}`);
          console.log(`Using even-move API with evalChange=${evalChange.toFixed(2)} (adjusted for ${computerColor})`);
          
          // Store current evaluation as previous for next move calculation
          previousEvalRef.current = currentEvalRef.current;
          
          // Use the even-move endpoint with the evaluation change
          response = await gameApi.getEvenMove(currentFen, evalChange, skillLevel);
        }
        
        console.log("API response:", response);
          
          if (response && response.move && response.move.length >= 4) {
            moveFrom = response.move.substring(0, 2);
            moveTo = response.move.substring(2, 4);
            if (response.move.length > 4) {
              movePromotion = response.move[4];
            }
          
          console.log(`API suggested move: ${moveFrom}${moveTo}${movePromotion !== 'q' ? movePromotion : ''}`);
          
          // Update the evaluation with the one returned from the API
          if (response.evaluation !== undefined) {
            console.log(`Updating evaluation to ${response.evaluation} after computer move`);
            currentEvalRef.current = response.evaluation;
          }
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
        console.log(`Using random fallback move: ${moveFrom}${moveTo}`);
      }
      
      // Double-check the move is valid before attempting it
      if (!legalMoves.some((m: any) => m.from === moveFrom && m.to === moveTo)) {
        console.error(`Move ${moveFrom}-${moveTo} is not in the list of legal moves`);
        
        // Use a random legal move if the selected move is invalid
        const randomIndex = Math.floor(Math.random() * legalMoves.length);
        const randomMove = legalMoves[randomIndex];
        moveFrom = randomMove.from;
        moveTo = randomMove.to;
        console.log(`Using random replacement move: ${moveFrom}${moveTo}`);
      }
          
      // Make the move in chess.js
      try {
        console.log(`Attempting to make move ${moveFrom} to ${moveTo} with promotion=${movePromotion}`);
        const result = chess.move({
          from: moveFrom,
          to: moveTo,
          promotion: movePromotion
        });
        
        if (!result) {
          throw new Error(`Invalid move: ${moveFrom} to ${moveTo}`);
        }
        
        console.log(`Successfully made move: ${result.san}`);
        
        // Get the updated FEN to pass to parent
        const updatedFen = chess.fen();
        
        // Update the chessground display with the new position
        if (chessgroundRef.current) {
          // Calculate legal moves for the new position (player's turn)
          const newDests = calculateDests();
          
          // Get the updated turn color after the move
          const turnColor = chess.turn() === 'w' ? 'white' : 'black';
          
          // Check if it's now the player's turn
          const isPlayerTurn = turnColor === playerSide;
          
          console.log(`After computer move: turnColor=${turnColor}, playerSide=${playerSide}, isPlayerTurn=${isPlayerTurn}`);
          
          // Update chessground with the new position and move permissions
          chessgroundRef.current.set({
            fen: updatedFen,
            turnColor: turnColor,
            lastMove: [moveFrom as Key, moveTo as Key],
            movable: {
              color: playerSide,
              dests: isPlayerTurn ? newDests : new Map()
            },
            // Important: ensure the player can now move
            draggable: { enabled: isPlayerTurn && !viewOnly },
            selectable: { enabled: isPlayerTurn && !viewOnly }
          });
          
          // Explicitly log if the player should be able to move now
          if (isPlayerTurn) {
            console.log("It's now the player's turn to move");
          } else {
            console.log("It's still the computer's turn to move");
          }
        }
        
        // Call onMove callback with the computer's move to keep parent in sync
        if (onMove) {
          console.log("Calling onMove callback to sync with parent");
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
      // Make sure we have a chess instance
      if (!chessRef.current) {
        console.error("Chess instance is null in handleMove");
        return false;
      }
      
      const chess = chessRef.current;
      
      // Store the current evaluation as the previous one before making the move
      if (currentEvalRef.current !== null) {
        previousEvalRef.current = currentEvalRef.current;
        console.log(`Storing previous evaluation: ${previousEvalRef.current} before player move`);
      }
      
      // Get the pre-move FEN for logging
      const preFen = chess.fen();
      
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
      
      console.log(`Player (${playerSide}) made move: ${moveResult.san}`);
      
      // Get the updated FEN after the move for synchronization
      const updatedFen = chess.fen();
      
      // Evaluate the position after player's move - this will be compared to previousEvalRef
      // to determine how much the position changed due to player's move
      const newEval = await updateEvaluation(updatedFen, currentEvalRef);
      
      // Calculate the evaluation change
      const evalChange = previousEvalRef.current !== null 
        ? newEval - previousEvalRef.current 
        : 0;
        
      console.log(`Position evaluation changed by ${evalChange.toFixed(2)} after player's move`);
      
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
        // Give a small delay to make the move feel more natural
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
  
  // Initialize the chess instance once only - must run before any other effects
  useEffect(() => {
    try {
      // Always recreate the chess instance with the current FEN
      chessRef.current = new Chess(fen);
      console.log("Created new Chess instance with FEN:", fen);
      
      // Force the chessground to reinitialize from scratch when player side changes
      // This entirely avoids the race condition where chessground tries to 
      // access a null chess instance
      if (chessgroundRef.current) {
        chessgroundRef.current.destroy();
        chessgroundRef.current = null;
      }
      hasInitializedRef.current = false;
      
    } catch (error) {
      console.error("Error creating Chess instance:", error);
    }
  }, [fen, playerSide]); // Recreate when FEN or playerSide changes
  
  // Make sure the board layout is properly set up before trying to play
  useEffect(() => {
    // When switching sides, make sure the boardRef exists before proceeding
    if (!boardRef.current || !chessRef.current) {
      return; // Exit early and let the next render handle initialization
    }
    
    // Wait for DOM to be ready
    const initializeBoard = () => {
    if (!boardRef.current || !chessRef.current) return;
    
      try {
        // Ensure we have chess.js instance before proceeding
        const chess = chessRef.current;
        const currentFen = chess.fen();
        
        // Create or update the chessground instance
        if (!hasInitializedRef.current) {
          const turnColor = chess.turn() === 'w' ? 'white' : 'black';
          const canPlayerMove = turnColor === playerSide;
    const dests = calculateDests();
    
    const config: Config = {
            fen: currentFen,
            orientation: orientation,
      viewOnly: false,
      coordinates: true,
      movable: {
        free: false,
              color: playerSide,
              dests: canPlayerMove ? dests : new Map(),
        events: {
          after: handleMove
        }
      },
      animation: {
        enabled: true,
        duration: 200
      },
      draggable: {
              enabled: !viewOnly && canPlayerMove,
        showGhost: true
      },
      selectable: {
              enabled: !viewOnly && canPlayerMove
      },
      highlight: {
        lastMove: true,
        check: true
      },
      premovable: {
        enabled: false
      }
    };
    
          // Recreate the chessground from scratch
          if (chessgroundRef.current) {
            chessgroundRef.current.destroy();
          }
          
          chessgroundRef.current = Chessground(boardRef.current, config);
          hasInitializedRef.current = true;
          console.log("Successfully initialized chessground");
          
          // Check if computer should make a move
          const isStartingPosition = currentFen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
          const isComputerTurn = turnColor !== playerSide;
          
          if (!viewOnly && isComputerTurn) {
            if (isStartingPosition && playerSide === 'black') {
              console.log("First move as white when player is black - making computer move");
              // Use timeout to ensure board is fully rendered
              setTimeout(() => {
                makeStockfishMove();
              }, 500);
            } else if (!isStartingPosition) {
              console.log("Computer's turn - making move");
            setTimeout(() => {
              makeStockfishMove();
            }, 500);
          }
        }
        } else {
          // Just update existing chessground
          updateChessground();
        }
      } catch (err) {
        console.error("Error in board initialization:", err);
      }
    };
    
    // Run initialization after a short delay to ensure DOM is ready
    setTimeout(initializeBoard, 100);
    
    // Cleanup on unmount
    return () => {
      if (chessgroundRef.current) {
        chessgroundRef.current.destroy();
        chessgroundRef.current = null;
      }
      hasInitializedRef.current = false;
    };
  }, [orientation, fen, playerSide, viewOnly]);

  // Modify updateChessground to be more robust and always verify state is correct
  function updateChessground() {
    if (!boardRef.current) {
      console.error("Cannot update chessground: boardRef is null");
      return;
    }
    
    if (!chessRef.current) {
      console.error("Cannot update chessground: chessRef is null");
      return;
    }
    
    if (!chessgroundRef.current || !hasInitializedRef.current) {
      console.log("Chessground not initialized yet, will initialize from scratch");
      // Let the initialization effect handle this
      hasInitializedRef.current = false;
      return;
    }
    
    // Get the current FEN directly from the chess instance
    let currentFen;
    try {
      currentFen = chessRef.current.fen();
    } catch (error) {
      console.error("Error getting FEN in updateChessground:", error);
      return;
    }
    
    // Calculate legal moves for the current position
    let dests;
    try {
      dests = calculateDests();
    } catch (error) {
      console.error("Error calculating legal moves:", error);
      dests = new Map(); // Empty map as fallback
    }
    
    // Get the current turn from chess.js
    let turnColor: Color = 'white';
    try {
      turnColor = chessRef.current.turn() === 'w' ? 'white' : 'black';
    } catch (error) {
      console.error("Error getting turn color:", error);
    }
    
    // Determine if the current player should be able to move
    const canMove = turnColor === playerSide;
    
    try {
      // Update existing instance with current state
      const updatedMovable = {
        color: playerSide,
        dests: canMove ? dests : new Map(),
      };
      
      chessgroundRef.current.set({ 
        fen: currentFen,
        turnColor: turnColor,
        orientation: orientation,
        movable: updatedMovable,
        draggable: { enabled: !viewOnly && canMove },
        selectable: { enabled: !viewOnly && canMove }
      });
      
      console.log(`Updated board: playerSide=${playerSide}, turnColor=${turnColor}, canMove=${canMove}`);
    } catch (err: any) {
      console.error("Error updating chessground:", err);
      
      // Reinitialize on failure
      hasInitializedRef.current = false;
    }
  }
  
  // Initialize the evaluation when the board is first set up or player side changes
  useEffect(() => {
    // Check if player side has changed
    const hasPlayerSideChanged = previousPlayerSideRef.current !== playerSide;
    if (hasPlayerSideChanged) {
      // Update the previous player side
      previousPlayerSideRef.current = playerSide;
      // Reset the evaluation initialization flag when player side changes
      hasInitializedEvaluationRef.current = false;
      console.log(`Player side changed to ${playerSide}, will reinitialize evaluation`);
    }
    
    // Only run this if we have a chess instance and haven't initialized evaluation for this playerSide yet
    if (chessRef.current && !hasInitializedEvaluationRef.current) {
      console.log(`Initializing evaluation for playerSide=${playerSide}`);
      
      // Update the flag to prevent duplicate initialization
      hasInitializedEvaluationRef.current = true;
      
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
          
          console.log("Initializing position evaluation for adaptive learning");
          
          // Get the current FEN
          const currentFen = chessRef.current.fen();
          
          // Set both references to the same initial evaluation
          const initialEval = await evaluatePosition(currentFen);
          previousEvalRef.current = initialEval;
          currentEvalRef.current = initialEval;
          
          console.log(`Initial evaluation set to ${initialEval} for ${playerSide}`);
          
          // If player is black and it's the starting position, we need to prepare
          // for the first white move with proper evaluation
          const isStartingPosition = currentFen.includes('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
          if (playerSide === 'black' && isStartingPosition) {
            console.log("Player is black with starting position - the computer's first move will use getBestMove API");
            console.log("Subsequent moves will use the even-move API for adaptive learning");
          } else if (playerSide === 'white') {
            console.log("Player is white - all computer moves will use the even-move API for adaptive learning");
          }
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
  }, [playerSide]);
  
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