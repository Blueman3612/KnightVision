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
        <title>Chess Tutor</title>
        <meta name="description" content="Personalized chess training platform" />
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
              <div className="text-white font-bold text-xl">Chess Tutor</div>
              <div className="flex items-center space-x-4">
                <Button 
                  href="/tutor"
                  variant="ghost"
                  size="sm"
                  className={router.pathname === '/tutor' ? 'text-white bg-gray-800 bg-opacity-50' : 'text-gray-300'}
                >
                  Tutor
                </Button>
                <Button 
                  href="/profile"
                  variant="ghost"
                  size="sm"
                  className={router.pathname === '/profile' ? 'text-white bg-gray-800 bg-opacity-50' : 'text-gray-300'}
                >
                  Profile
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="border-gray-500"
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