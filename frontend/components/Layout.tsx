import React, { ReactNode } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Link from 'next/link';
import Button from './ui/Button';

interface LayoutProps {
  children: ReactNode;
  hideNav?: boolean;
}

function Layout({ children, hideNav = false }: LayoutProps) {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Don't show nav on login and register pages or when hideNav is true
  const isAuthPage = router.pathname === '/login' || router.pathname === '/register';
  const shouldShowNav = session && !isAuthPage && !hideNav;

  return (
    <>
      <Head>
        <title>KnightVision</title>
        <meta name="description" content="Personalized chess training and analysis platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-800 via-gray-900 to-black font-sans">
        {shouldShowNav && (
          <nav className="w-full py-4 px-6 bg-black bg-opacity-30">
            <div className="container mx-auto flex justify-between items-center">
              <div className="flex items-center space-x-3">
                {/* Chess Knight icon with gradient matching Vision text */}
                <svg className="h-9 w-9" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="knightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#a5b4fc" /> {/* indigo-300, brighter */}
                      <stop offset="60%" stopColor="#8b5cf6" /> {/* violet-500, mid transition */}
                      <stop offset="100%" stopColor="#d946ef" /> {/* fuchsia-500, more vibrant end */}
                    </linearGradient>
                  </defs>
                  <g fill="url(#knightGradient)" stroke="#4c1d95" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
                    <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
                    <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" />
                    <path d="M14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" />
                  </g>
                </svg>
                {/* Stylized app name with larger font */}
                <div className="font-bold text-2xl flex items-center">
                  <span className="text-white font-extrabold">Knight</span>
                  <span className="bg-gradient-to-r from-indigo-400 to-purple-500 text-transparent bg-clip-text font-bold">Vision</span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <Button 
                  href="/tutor"
                  variant="ghost"
                  size="sm"
                  className={router.pathname === '/tutor' ? 'text-white bg-gray-800 bg-opacity-50' : 'text-gray-300'}
                  leftIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  }
                >
                  Tutor
                </Button>
                <Button 
                  href="/profile"
                  variant="ghost"
                  size="sm"
                  className={router.pathname === '/profile' ? 'text-white bg-gray-800 bg-opacity-50' : 'text-gray-300'}
                  leftIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  }
                >
                  Profile
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="border-gray-500"
                  leftIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  }
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </nav>
        )}

        <main className="flex-grow flex items-center justify-center">
          {children}
        </main>
      </div>
    </>
  );
}

export default Layout; 