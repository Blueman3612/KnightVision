import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from '@supabase/auth-helpers-react';
import Link from 'next/link';
import Head from 'next/head';

const Home = () => {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    // If logged in, redirect to tutor page
    if (session) {
      router.push('/tutor');
    }
  }, [session, router]);

  // If logged in, show nothing while redirecting
  if (session) {
    return null;
  }

  return (
    <React.Fragment>
      <Head>
        <title>Chess Tutor - Personalized Chess Training</title>
        <meta name="description" content="Improve your chess skills with personalized training and analysis" />
      </Head>
      <div className="flex flex-col items-center min-h-[calc(100vh-144px)]">
        <div className="w-full max-w-6xl px-4 pt-16 pb-20 mx-auto text-center sm:pt-24 sm:pb-32">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            <span className="block">Improve your chess with</span>
            <span className="block text-indigo-600">personalized training</span>
          </h1>
          <p className="max-w-md mx-auto mt-6 text-xl text-gray-500 sm:max-w-3xl">
            Chess Tutor analyzes your games, identifies your weaknesses, and provides tailored practice to help you improve.
          </p>
          
          <div className="max-w-md mx-auto mt-10 sm:flex sm:justify-center">
            <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex">
              <Link 
                href="/login"
                className="flex items-center justify-center w-full px-8 py-3 text-base font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 md:text-lg"
              >
                Sign in
              </Link>
              <Link 
                href="/register"
                className="flex items-center justify-center w-full px-8 py-3 text-base font-medium text-indigo-600 bg-white border border-transparent rounded-md shadow-sm hover:bg-gray-50 md:text-lg"
              >
                Create Account
              </Link>
            </div>
          </div>
        </div>
        
        <div className="w-full max-w-6xl px-4 mx-auto">
          <div className="relative">
            <div className="relative px-4 py-10 overflow-hidden bg-white shadow-xl sm:rounded-2xl sm:px-10 sm:pb-12">
              <div className="relative mx-auto divide-y divide-gray-200 lg:max-w-7xl">
                <div className="pt-4 pb-8 sm:pt-6 sm:pb-10">
                  <h2 className="text-2xl font-extrabold tracking-tight text-center text-gray-900 sm:text-3xl">
                    A smarter way to learn chess
                  </h2>
                  <div className="flow-root mt-8">
                    <div className="-mx-4 -mb-8 sm:-mx-6">
                      <div className="grid px-4 mx-auto space-y-12 sm:grid-cols-2 sm:gap-x-6 sm:space-y-0 lg:grid-cols-3 lg:gap-x-8">
                        <div className="relative">
                          <div className="text-center">
                            <div className="flex items-center justify-center w-12 h-12 mx-auto text-white bg-indigo-600 rounded-md">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                            </div>
                            <h3 className="mt-6 text-lg font-medium text-gray-900">Analyze Your Games</h3>
                            <p className="mt-2 text-base text-gray-500">
                              Upload your games and get detailed analysis of your strengths and weaknesses.
                            </p>
                          </div>
                        </div>
                        <div className="relative">
                          <div className="text-center">
                            <div className="flex items-center justify-center w-12 h-12 mx-auto text-white bg-indigo-600 rounded-md">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                              </svg>
                            </div>
                            <h3 className="mt-6 text-lg font-medium text-gray-900">Personalized Training</h3>
                            <p className="mt-2 text-base text-gray-500">
                              Get custom lessons and exercises designed specifically for your improvement areas.
                            </p>
                          </div>
                        </div>
                        <div className="relative">
                          <div className="text-center">
                            <div className="flex items-center justify-center w-12 h-12 mx-auto text-white bg-indigo-600 rounded-md">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            </div>
                            <h3 className="mt-6 text-lg font-medium text-gray-900">Adaptive Play</h3>
                            <p className="mt-2 text-base text-gray-500">
                              Play against an engine that adapts to your skill level for optimal learning.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};

export default Home; 