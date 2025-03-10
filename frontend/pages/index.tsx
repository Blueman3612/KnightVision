import React from 'react';
import { NextPage } from 'next';
import Link from 'next/link';
import { useSession } from '@supabase/auth-helpers-react';

const HomePage: NextPage = () => {
  const session = useSession();

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-primary-600 mb-4">Welcome to Chess Tutor</h1>
        <p className="text-xl text-secondary-600 max-w-3xl mx-auto">
          Your personalized chess training platform that analyzes your games, identifies your weaknesses, and helps you improve with tailored lessons.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        <div className="card text-center">
          <div className="text-5xl text-primary-500 mb-4">♟️</div>
          <h2 className="text-2xl font-bold mb-2">Play</h2>
          <p className="mb-4">Challenge our adaptive chess engine that adjusts to your skill level for the perfect practice.</p>
          <Link href="/play" className="btn-primary inline-block">
            Play Now
          </Link>
        </div>

        <div className="card text-center">
          <div className="text-5xl text-primary-500 mb-4">📊</div>
          <h2 className="text-2xl font-bold mb-2">Analyze</h2>
          <p className="mb-4">Upload your games for detailed analysis to identify strengths and weaknesses in your play.</p>
          <Link href="/analyze" className="btn-primary inline-block">
            Analyze Games
          </Link>
        </div>

        <div className="card text-center">
          <div className="text-5xl text-primary-500 mb-4">📚</div>
          <h2 className="text-2xl font-bold mb-2">Learn</h2>
          <p className="mb-4">Access personalized lessons and practice positions tailored to address your specific weaknesses.</p>
          <Link href="/lessons" className="btn-primary inline-block">
            Start Learning
          </Link>
        </div>
      </div>

      {!session && (
        <div className="bg-primary-50 rounded-lg p-8 text-center mb-16">
          <h2 className="text-2xl font-bold mb-4">Ready to improve your chess?</h2>
          <p className="text-lg mb-6">Create an account to track your progress and get personalized recommendations.</p>
          <div className="flex justify-center space-x-4">
            <Link href="/register" className="btn-primary">
              Sign Up
            </Link>
            <Link href="/login" className="btn-secondary">
              Log In
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-2xl font-bold mb-4">How It Works</h2>
          <ol className="space-y-4">
            <li className="flex">
              <span className="bg-primary-100 text-primary-800 rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0">1</span>
              <div>
                <h3 className="font-bold">Upload your chess games</h3>
                <p className="text-secondary-600">We analyze your games using advanced chess engines to identify patterns in your play.</p>
              </div>
            </li>
            <li className="flex">
              <span className="bg-primary-100 text-primary-800 rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0">2</span>
              <div>
                <h3 className="font-bold">Discover your weaknesses</h3>
                <p className="text-secondary-600">Our system identifies specific areas where you can improve, from tactical oversights to positional understanding.</p>
              </div>
            </li>
            <li className="flex">
              <span className="bg-primary-100 text-primary-800 rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0">3</span>
              <div>
                <h3 className="font-bold">Get personalized training</h3>
                <p className="text-secondary-600">Access custom lessons and practice positions designed specifically to address your weaknesses.</p>
              </div>
            </li>
            <li className="flex">
              <span className="bg-primary-100 text-primary-800 rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0">4</span>
              <div>
                <h3 className="font-bold">Track your improvement</h3>
                <p className="text-secondary-600">Monitor your progress over time with detailed metrics and performance analytics.</p>
              </div>
            </li>
          </ol>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-4">Features</h2>
          <ul className="space-y-3">
            <li className="flex items-start">
              <svg className="h-6 w-6 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Detailed game analysis with Stockfish</span>
            </li>
            <li className="flex items-start">
              <svg className="h-6 w-6 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Personalized weakness identification</span>
            </li>
            <li className="flex items-start">
              <svg className="h-6 w-6 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Custom training positions based on your needs</span>
            </li>
            <li className="flex items-start">
              <svg className="h-6 w-6 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Adaptive gameplay that matches your skill level</span>
            </li>
            <li className="flex items-start">
              <svg className="h-6 w-6 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Progress tracking and improvement metrics</span>
            </li>
            <li className="flex items-start">
              <svg className="h-6 w-6 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Comprehensive lesson library covering all aspects of chess</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default HomePage; 