import React, { useEffect, useState } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useSession } from '@supabase/auth-helpers-react';
import { Chess } from 'chess.js';
import Chessboard from '@/components/Chessboard';
import { gameApi } from '@/lib/api';

const PlayPage: NextPage = () => {
  const router = useRouter();
  const session = useSession();
  const [fen, setFen] = useState<string>('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [chess, setChess] = useState<Chess>(new Chess());
  const [gameState, setGameState] = useState<{
    isCheck: boolean;
    isCheckmate: boolean;
    isStalemate: boolean;
    isGameOver: boolean;
    turn: 'w' | 'b';
  }>({
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isGameOver: false,
    turn: 'w',
  });
  const [skillLevel, setSkillLevel] = useState<number>(10);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [lastMove, setLastMove] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');

  // Start a new game
  const startNewGame = async () => {
    try {
      const newGame = await gameApi.newGame();
      setFen(newGame.fen);
      const newChess = new Chess();
      setChess(newChess);
      setGameState({
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
        isGameOver: false,
        turn: 'w',
      });
      setLastMove([]);
    } catch (error) {
      console.error('Failed to start new game:', error);
    }
  };

  // Handle player move
  const handleMove = async (from: string, to: string) => {
    if (isThinking || gameState.isGameOver) return;

    try {
      // Make the move locally
      const move = chess.move({ from, to, promotion: 'q' }); // Default to queen promotion
      if (!move) return; // Invalid move

      // Update state
      setFen(chess.fen());
      setLastMove([from, to]);
      updateGameState();

      // If game is not over, get computer's move
      if (!chess.isGameOver()) {
        await getComputerMove();
      }
    } catch (error) {
      console.error('Error making move:', error);
    }
  };

  // Get computer's move
  const getComputerMove = async () => {
    setIsThinking(true);
    try {
      const result = await gameApi.getBestMove(chess.fen(), skillLevel);
      
      if (result.move) {
        const [from, to] = [result.move.slice(0, 2), result.move.slice(2, 4)];
        
        // Make the move locally
        chess.move({ from, to, promotion: 'q' });
        
        // Update state
        setFen(chess.fen());
        setLastMove([from, to]);
        updateGameState();
      }
    } catch (error) {
      console.error('Error getting computer move:', error);
    } finally {
      setIsThinking(false);
    }
  };

  // Update game state
  const updateGameState = () => {
    setGameState({
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      isGameOver: chess.isGameOver(),
      turn: chess.turn() as 'w' | 'b',
    });
  };

  // Flip board orientation
  const flipBoard = () => {
    setOrientation(orientation === 'white' ? 'black' : 'white');
  };

  // Initialize game
  useEffect(() => {
    startNewGame();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Play Against Stockfish</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Chessboard 
            fen={fen} 
            orientation={orientation} 
            onMove={handleMove}
            highlightSquares={lastMove}
          />
        </div>
        
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Game Controls</h2>
          
          <div className="mb-6">
            <label className="form-label">Engine Strength</label>
            <div className="flex items-center">
              <span className="mr-2">Weaker</span>
              <input 
                type="range" 
                min="1" 
                max="20" 
                value={skillLevel} 
                onChange={(e) => setSkillLevel(parseInt(e.target.value))}
                className="w-full"
              />
              <span className="ml-2">Stronger</span>
            </div>
            <div className="text-center mt-1">Level: {skillLevel}</div>
          </div>
          
          <div className="flex flex-col space-y-3">
            <button 
              onClick={startNewGame}
              className="btn-primary"
            >
              New Game
            </button>
            
            <button 
              onClick={flipBoard}
              className="btn-secondary"
            >
              Flip Board
            </button>
          </div>
          
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Game Status</h3>
            <div className="p-3 bg-secondary-100 rounded">
              {isThinking && <p className="text-primary-600">Engine is thinking...</p>}
              {gameState.isGameOver ? (
                <div>
                  <p className="font-bold">Game Over</p>
                  {gameState.isCheckmate && (
                    <p>{gameState.turn === 'w' ? 'Black' : 'White'} wins by checkmate!</p>
                  )}
                  {gameState.isStalemate && <p>Draw by stalemate</p>}
                </div>
              ) : (
                <p>{gameState.turn === 'w' ? 'White' : 'Black'} to move</p>
              )}
              {gameState.isCheck && !gameState.isCheckmate && <p>Check!</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayPage; 