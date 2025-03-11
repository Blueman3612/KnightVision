import React, { ReactNode } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Don't show sign out button on login and register pages
  const isAuthPage = router.pathname === '/login' || router.pathname === '/register';

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
        {session && !isAuthPage && (
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={handleSignOut}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-black bg-opacity-30 hover:bg-opacity-40 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign Out
            </button>
          </div>
        )}

        <main className="flex-grow flex items-center justify-center">
          {children}
        </main>
      </div>
    </>
  );
}

export default Layout; 