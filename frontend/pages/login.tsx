import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Link from 'next/link';
import Head from 'next/head';
import Button from '../components/ui/Button';
import { TextInput } from '../components/ui';

const Login = () => {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (session) {
      router.push('/tutor');
    }
  }, [session, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        throw error;
      }
      
      // Redirect is handled by the useEffect
    } catch (error: any) {
      setError(error.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  // Check if coming from registration
  const justRegistered = router.query.registered === 'true';

  return (
    <>
      <Head>
        <title>Sign in | KnightVision</title>
      </Head>
      <div className="min-h-screen flex flex-col justify-center">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            {/* KnightVision Logo - Twice as big */}
            <div className="flex flex-col items-center">
              <svg className="h-24 w-24" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
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
              <div className="mt-2 font-bold text-4xl flex items-center">
                <span className="text-white font-extrabold">Knight</span>
                <span className="bg-gradient-to-r from-indigo-400 to-purple-500 text-transparent bg-clip-text font-bold">Vision</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm py-8 px-4 shadow-lg rounded-lg border border-gray-700 sm:px-10">
            {justRegistered && (
              <div className="mb-4 rounded-md bg-green-900 bg-opacity-50 p-4 text-green-200 border border-green-800">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium">
                      Registration successful! Please check your email to confirm your account before signing in.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="mb-4 rounded-md bg-red-900 bg-opacity-50 p-4 text-red-200 border border-red-800">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <form className="space-y-6" onSubmit={handleLogin}>
              <TextInput
                id="email"
                name="email"
                type="email"
                label="Email address"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
              />

              <TextInput
                id="password"
                name="password"
                type="password"
                label="Password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
              />

              <div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  fullWidth
                  isLoading={loading}
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </Button>
              </div>
              
              <p className="mt-6 text-center text-sm text-gray-300">
                Or{' '}
                <Link href="/register" className="font-medium text-indigo-400 hover:text-indigo-300">
                  create a new account
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login; 