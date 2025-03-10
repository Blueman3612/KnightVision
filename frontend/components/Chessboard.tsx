import React, { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Config } from 'chessground/config';
import { Chess, Square } from 'chess.js';
import { Color, Key } from 'chessground/types';

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
  const [chess] = useState<Chess>(new Chess(fen));

  // Initialize chessground
  useEffect(() => {
    if (boardRef.current) {
      const config: Config = {
        fen,
        orientation,
        viewOnly,
        movable: {
          free: false,
          color: viewOnly ? undefined : 'both',
          dests: viewOnly ? undefined : getDests(chess),
          events: {
            after: (from, to) => {
              if (onMove) {
                onMove(from, to);
              }
            },
          },
        },
        highlight: {
          lastMove: true,
          check: true,
        },
        animation: {
          enabled: true,
          duration: 200,
        },
        premovable: {
          enabled: !viewOnly,
        },
        drawable: {
          enabled: true,
          visible: true,
        },
        coordinates: true,
      };

      const cg = Chessground(boardRef.current, config);
      setChessground(cg);

      return () => {
        // Cleanup
        cg.destroy();
      };
    }
  }, []);

  // Update FEN when it changes
  useEffect(() => {
    if (chessground) {
      chessground.set({ fen });
      chess.load(fen);
      
      if (!viewOnly) {
        chessground.set({ movable: { dests: getDests(chess) } });
      }
    }
  }, [fen, chessground, viewOnly]);

  // Update orientation when it changes
  useEffect(() => {
    if (chessground) {
      chessground.set({ orientation });
    }
  }, [orientation, chessground]);

  // Update highlighted squares
  useEffect(() => {
    if (chessground && highlightSquares.length > 0) {
      const highlights: { [key: string]: { className: string } } = {};
      highlightSquares.forEach((square) => {
        highlights[square] = { className: 'highlight' };
      });
      
      chessground.set({
        drawable: {
          shapes: [],
          autoShapes: [],
        }
      });
      
      chessground.setShapes(
        highlightSquares.map(square => ({
          orig: square as Key,
          brush: 'green',
        }))
      );
    }
  }, [highlightSquares, chessground]);

  // Helper function to get possible destinations for each piece
  function getDests(chess: Chess): Map<Key, Key[]> {
    const dests = new Map();
    
    // Get all squares from 'a1' to 'h8'
    const squares: Square[] = [];
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
    
    for (const file of files) {
      for (const rank of ranks) {
        // Cast the square to Square type
        squares.push(`${file}${rank}` as Square);
      }
    }
    
    // For each square, get possible moves
    squares.forEach(s => {
      try {
        const ms = chess.moves({ square: s, verbose: true });
        if (ms.length) dests.set(s, ms.map(m => m.to));
      } catch (e) {
        // Skip invalid squares
      }
    });
    
    return dests;
  }

  return (
    <div className="w-full aspect-square max-w-lg mx-auto">
      <div ref={boardRef} className="w-full h-full" />
    </div>
  );
};

export default Chessboard; 