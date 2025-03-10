import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { useState } from 'react'
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'
import { SessionContextProvider, Session } from '@supabase/auth-helpers-react'
import { QueryClient, QueryClientProvider } from 'react-query'
import Layout from '@/components/Layout'

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