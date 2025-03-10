import React, { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Config } from 'chessground/config';
import { Chess, Square } from 'chess.js';
import { Color, Key } from 'chessground/types';

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
}

// Using proper function component definition without React.FC
function Chessboard({
  fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Default starting position
  orientation = 'white',
  viewOnly = false,
  onMove,
  highlightSquares = [],
}: ChessboardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [chessground, setChessground] = useState<Api | null>(null);
  const [chess] = useState(() => new Chess(fen));

  // Function to calculate legal move destinations for each piece
  const calculateDests = () => {
    const dests = new Map();
    try {
      // Loop through all squares
      const squares = [];
      // Generate all square names (a1 through h8)
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const file = String.fromCharCode(97 + i); // 'a' to 'h'
          const rank = String(j + 1); // '1' to '8'
          squares.push(`${file}${rank}`);
        }
      }

      // For each square, if there's a piece of the current player, calculate its legal moves
      squares.forEach(square => {
        const piece = chess.get(square as Square);
        if (piece && piece.color === ((chess as any).turn() === 'w' ? 'w' : 'b')) {
          const moves = chess.moves({ square: square as Square, verbose: true });
          if (moves && moves.length > 0) {
            dests.set(
              square,
              moves.map(move => move.to)
            );
          }
        }
      });
    } catch (error) {
      console.error('Error calculating destinations:', error);
    }
    return dests;
  };

  // Initialize chessground when the component mounts
  useEffect(() => {
    const initializeChessground = () => {
      if (!boardRef.current) {
        console.log("Board ref is null, cannot initialize chessground");
        return;
      }

      console.log("Initializing chessground with FEN:", fen);
      
      try {
        // Calculate legal move destinations
        const dests = calculateDests();
        console.log("Legal moves:", dests);
        
        const config: Config = {
          fen,
          orientation,
          viewOnly,
          coordinates: true,
          movable: {
            free: false,
            color: 'both',
            dests: dests,
            events: {
              after: (orig: Key, dest: Key) => {
                console.log("Move made:", orig, dest);
                try {
                  // Make the move in our chess instance
                  const moveResult = chess.move({
                    from: orig as string,
                    to: dest as string,
                    promotion: 'q'
                  });
                  
                  console.log("Move result:", moveResult);
                  
                  if (onMove) {
                    onMove(orig as string, dest as string);
                  }
                  
                  // Update the board with the new position and legal moves
                  if (chessground) {
                    const newDests = calculateDests();
                    chessground.set({ 
                      fen: chess.fen(),
                      turnColor: (chess as any).turn() === 'w' ? 'white' : 'black',
                      movable: {
                        dests: newDests
                      }
                    });
                  }
                } catch (error) {
                  console.error("Error making move:", error);
                }
              }
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
          highlight: {
            lastMove: true,
            check: true
          }
        };
        
        // Type assertion since we checked boardRef.current above
        const cg = Chessground(boardRef.current!, config);
        setChessground(cg);
        console.log("Chessground initialized successfully");
      } catch (error) {
        console.error("Error initializing chessground:", error);
      }
    };
    
    // Call initialization function
    initializeChessground();
    
    return () => {
      if (chessground) {
        console.log("Cleaning up chessground");
        chessground.destroy();
      }
    };
  }, []);

  // Update when FEN changes
  useEffect(() => {
    if (!chessground) return;
    
    console.log("Updating FEN to:", fen);
    try {
      // Update the chess.js instance
      chess.load(fen);
      
      // Calculate legal moves for the new position
      const dests = calculateDests();
      
      // Update the board
      chessground.set({ 
        fen,
        turnColor: (chess as any).turn() === 'w' ? 'white' : 'black',
        movable: {
          dests: dests
        }
      });
    } catch (error) {
      console.error("Error updating position:", error);
    }
  }, [fen, chessground]);

  // Update orientation when it changes
  useEffect(() => {
    if (chessground) {
      console.log("Updating orientation to:", orientation);
      chessground.set({ orientation });
    }
  }, [orientation, chessground]);

  console.log("Rendering chessboard component");
  
  return (
    <div className="w-full h-full relative border-8 border-solid border-[#3a2a1d] rounded-lg overflow-hidden">
      <div ref={boardRef} className="w-full h-full" />
    </div>
  );
}

export default Chessboard; 