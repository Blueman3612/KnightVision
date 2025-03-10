import React, { ReactNode, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Chessboard from '@/components/Chessboard';
import { Chess } from 'chess.js';
import Head from 'next/head';

interface TutorPageProps {
  children?: ReactNode;
}

const TutorPage: React.FC<TutorPageProps> = () => {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const chessRef = useRef(new Chess());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [gameStatus, setGameStatus] = useState<string>('');
  const [fen, setFen] = useState<string>(chessRef.current.fen());

  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  const handleMove = (from: string, to: string) => {
    try {
      console.log(`Move handled in tutor page: ${from} to ${to}`);
      
      // The actual move has already been made in the Chessboard component
      // We just need to sync our state with it
      const chess = chessRef.current;
      setFen(chess.fen());
      
      // Check game status
      if (chess.game_over()) {
        if (chess.in_checkmate()) {
          setGameStatus('Checkmate!');
        } else if (chess.in_draw()) {
          setGameStatus('Draw!');
        } else if (chess.in_stalemate()) {
          setGameStatus('Stalemate!');
        } else if (chess.in_threefold_repetition()) {
          setGameStatus('Draw by repetition!');
        } else if (chess.insufficient_material()) {
          setGameStatus('Draw by insufficient material!');
        }
      } else if (typeof chess.in_check === 'function' && chess.in_check()) {
        setGameStatus('Check!');
      } else {
        setGameStatus('');
      }
    } catch (e) {
      console.error('Error handling move:', e);
    }
  };

  const resetGame = () => {
    console.log('Resetting game');
    const chess = chessRef.current;
    chess.reset();
    setFen(chess.fen());
    setGameStatus('');
  };

  const flipBoard = () => {
    console.log(`Flipping board to ${orientation === 'white' ? 'black' : 'white'}`);
    setOrientation(orientation === 'white' ? 'black' : 'white');
  };

  // If not logged in, show nothing (will redirect)
  if (!session) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Chess Tutor</title>
      </Head>
      <div className="w-full max-w-3xl flex flex-col items-center justify-center">
        <div className="chessboard-container relative">
          <div className="absolute top-3 right-3 z-10 flex space-x-2">
            <button
              onClick={flipBoard}
              className="p-2 rounded-full bg-white bg-opacity-80 hover:bg-opacity-100 text-gray-800 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              title="Flip Board"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
            <button
              onClick={resetGame}
              className="p-2 rounded-full bg-white bg-opacity-80 hover:bg-opacity-100 text-gray-800 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              title="Reset Game"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="w-full h-full">
            <Chessboard 
              fen={fen} 
              onMove={handleMove}
              orientation={orientation}
            />
          </div>
        </div>
        
        {gameStatus && (
          <div className="mt-4 px-6 py-3 bg-white bg-opacity-80 backdrop-blur-sm rounded-lg shadow-lg">
            <p className="text-center font-medium text-gray-800">{gameStatus}</p>
          </div>
        )}
      </div>
    </>
  );
};

export default TutorPage; 