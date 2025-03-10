import React, { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Config } from 'chessground/config';
import { Chess, Square } from 'chess.js';
import { Color, Key } from 'chessground/types';

// Custom type definition for Chessground to accept null
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

const Chessboard: React.FC<ChessboardProps> = ({
  fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Default starting position
  orientation = 'white',
  viewOnly = false,
  onMove,
  highlightSquares = [],
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [chessground, setChessground] = useState<Api | null>(null);
  const [chess] = useState(() => new Chess(fen));

  // Initialize chessground when the component mounts
  useEffect(() => {
    if (!boardRef.current) {
      console.log("Board ref is null, cannot initialize chessground");
      return;
    }

    console.log("Initializing chessground with FEN:", fen);
    
    try {
      // For debugging
      console.log("Board container:", boardRef.current);
      
      const config: Config = {
        fen,
        orientation,
        viewOnly,
        coordinates: true,
        movable: {
          free: false,
          color: 'both',
          events: {
            after: (orig: Key, dest: Key) => {
              console.log("Move made:", orig, dest);
              try {
                // Make the move in our chess instance
                chess.move({
                  from: orig as string,
                  to: dest as string,
                  promotion: 'q'
                });
                
                if (onMove) {
                  onMove(orig as string, dest as string);
                }
                
                // Update the board with the new position
                if (chessground) {
                  chessground.set({ 
                    fen: chess.fen(),
                    turnColor: (chess as any).turn() === 'w' ? 'white' : 'black'
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
        }
      };
      
      const cg = Chessground(boardRef.current, config);
      setChessground(cg);
      console.log("Chessground initialized successfully");
    } catch (error) {
      console.error("Error initializing chessground:", error);
    }
    
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
      
      // Update the board
      chessground.set({ 
        fen,
        turnColor: (chess as any).turn() === 'w' ? 'white' : 'black'
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
};

export default Chessboard; 