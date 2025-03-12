import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from '@supabase/auth-helpers-react';
import Head from 'next/head';

const Home = () => {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    // If logged in, redirect to tutor page
    if (session) {
      router.push('/tutor');
    } else {
      // If not logged in, redirect to login page
      router.push('/login');
    }
  }, [session, router]);

  // Show a minimal loading state while redirecting
  return (
    <React.Fragment>
      <Head>
        <title>KnightVision - Redirecting...</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {/* Simple loading indicator with larger size */}
          <div className="animate-pulse">
            <svg className="h-40 w-40 mx-auto" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="knightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a5b4fc" />
                  <stop offset="60%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#d946ef" />
                </linearGradient>
              </defs>
              <g fill="url(#knightGradient)" stroke="#4c1d95" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
                <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
                <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" />
                <path d="M14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" />
              </g>
            </svg>
            <p className="mt-6 text-gray-300 text-3xl font-medium">Redirecting...</p>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};

export default Home; 