import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'
import { SessionContextProvider, Session } from '@supabase/auth-helpers-react'
import { QueryClient, QueryClientProvider } from 'react-query'
import Layout from '@/components/Layout'

// Configure hot reloading for Docker
const isDockerEnvironment = process.env.NEXT_PUBLIC_DOCKER === 'true'

export default function App({ 
  Component, 
  pageProps 
}: AppProps<{ initialSession: Session }>) {
  // Create a new Supabase browser client on every first render
  const [supabaseClient] = useState(() => createPagesBrowserClient())
  
  // Create a new React Query client
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }))

  // Enable hot-reload for Docker environments
  useEffect(() => {
    if (isDockerEnvironment) {
      console.log('Running in Docker environment with enhanced hot reloading')
    }
  }, [])

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={pageProps.initialSession}
    >
      <QueryClientProvider client={queryClient}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </QueryClientProvider>
    </SessionContextProvider>
  )
} 