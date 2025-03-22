import axios from 'axios';
import supabase from './supabase';
import { SessionResponse } from '@supabase/auth-helpers-react';

// Typecasting to avoid TS errors
type AxiosConfig = any;
type AxiosResp = any;
type AxiosErr = any;

// For type safety with process.env
declare const process: {
  env: {
    NEXT_PUBLIC_API_URL?: string;
    NEXT_PUBLIC_DOCKER?: string;
    NODE_ENV?: string;
    NEXT_PUBLIC_SUPABASE_URL?: string;
  };
};

// Determine if we're running in Docker/local development
const isDocker = process.env.NEXT_PUBLIC_DOCKER === 'true';
const isDevelopment = process.env.NODE_ENV === 'development';
const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');

// Set API URL based on environment
let apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

// Force local URL if we're in development/Docker
if (isDevelopment || isDocker || !apiUrl) {
  apiUrl = 'http://localhost:80';
}

// Create axios instance with base URL
const api = axios.create({
  baseURL: apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request logging and error handling
api.interceptors.request.use((config: AxiosConfig) => {
  // Add debug logging for the process-unannotated endpoint
  if (config.url?.includes('process-unannotated')) {
    console.log('Outgoing request to process-unannotated:');
    console.log('- Headers:', JSON.stringify({
      ...config.headers,
      // Only show partial auth token for security
      Authorization: config.headers?.Authorization 
        ? `${config.headers.Authorization.substring(0, 20)}...` 
        : undefined
    }));
    console.log('- URL:', config.url);
    console.log('- Method:', config.method);
  }
  return config;
});

api.interceptors.response.use(
  (response: AxiosResp) => {
    return response;
  }, 
  (error: AxiosErr) => {
    if (error.response) {
      // The request was made and the server responded with a status code outside of 2xx
      console.error(`API Error: ${error.response.status} ${error.config?.url}`, error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('API Error: No response received', error.request);
    } else {
      // Something happened in setting up the request
      console.error('API Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// Create a module-level variable to cache the token once we get it
let cachedAuthToken: string | null = null;

// Function to get or refresh the auth token
const getAuthToken = async (retry = true): Promise<string | null> => {
  try {
    // If we have a cached token, use it
    if (cachedAuthToken) {
      return cachedAuthToken;
    }

    // Try to get the session from Supabase
    const { data: session } = await supabase.auth.getSession();
    
    // Using our custom SessionResponse type which matches our implementation
    const sessionData = session as unknown as SessionResponse;
    
    if (sessionData?.access_token) {
      // Cache the token for future use
      cachedAuthToken = sessionData.access_token;
      return cachedAuthToken;
    } 
    
    // If we get here and retry is true, we'll try one more time after a short delay
    if (retry) {
      console.log('🔄 No token found, retrying after delay...');
      // Wait a bit and try again
      await new Promise(resolve => setTimeout(resolve, 500));
      return getAuthToken(false); // Don't retry again to prevent infinite loops
    }
    
    return null;
  } catch (err) {
    console.error('❌ Error getting auth token:', err);
    return null;
  }
};

// Listen for auth state changes to update our cached token
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      cachedAuthToken = session?.access_token || null;
      console.log('🔑 Auth token updated');
    } else if (event === 'SIGNED_OUT') {
      cachedAuthToken = null;
      console.log('🔒 Auth token cleared');
    }
  });
}

// Add auth token to requests if available
api.interceptors.request.use(async (config: AxiosConfig) => {
  // Only run on client side
  if (typeof window !== 'undefined') {
    try {
      // Initialize headers object if not exists
      config.headers = config.headers || {};
      
      // Log request URL for debugging (remove in production)
      console.log(`🔄 API Request to: ${config.url}`);
      
      // Get auth token with retry mechanism
      const token = await getAuthToken();
      
      if (token) {
        // Set the Authorization header with the Bearer token
        config.headers.Authorization = `Bearer ${token}`;
        
        // Log for debugging (remove in production)
        console.log('✅ Auth token added to request');
      } else {
        // Log warning if no token found
        console.warn('⚠️ No auth token available after retry');
      }
    } catch (err) {
      console.error('❌ Error setting auth token:', err);
    }
  }
  return config;
});

// Game API
export const gameApi = {
  // Start a new game
  newGame: async () => {
    const response = await api.get('/games/new-game');
    return response.data;
  },

  // Make a move
  makeMove: async (fen: string, move: string) => {
    const response = await api.post('/games/move', { fen, move });
    return response.data;
  },

  // Generic post method for custom API endpoints
  post: async (endpoint: string, data?: any) => {
    try {
      // Ensure endpoint starts with a slash for consistency
      const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      
      // Log the API call for debugging
      console.log(`📡 API POST request to: ${normalizedEndpoint}`);
      
      const response = await api.post(normalizedEndpoint, data || {});
      return response.data;
    } catch (error: any) {
      console.error(`❌ Error in API post to ${endpoint}:`, error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      throw error;
    }
  },

  // Process unannotated games 
  processUnannotatedGames: async (forceRetry: boolean = false, limit: number = 10) => {
    try {
      // Create proper payload matching API expectations - only send needed parameters
      const payload = { 
        limit: limit,
        force_retry: forceRetry
      };
      
      // Let the Axios interceptor handle authentication - no custom headers needed
      const response = await api.post('/games/process-unannotated', payload);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error processing unannotated games:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      throw error;
    }
  },

  // Get best move from Stockfish
  getBestMove: async (fen: string, skillLevel: number = 20, moveTime: number = 1.0) => {
    try {
      const response = await api.post('/games/best-move', { 
        fen, 
        skill_level: skillLevel, 
        move_time: moveTime 
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error getting best move:', error);
      // Log additional detail if it's an axios error
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      throw error;
    }
  },

  // Get adaptive "even move" from Stockfish
  getEvenMove: async (fen: string, evalChange: number, skillLevel: number = 20, moveTime: number = 1.0) => {
    try {
      // Pre-validate parameters to help debug
      if (!fen || typeof fen !== 'string') {
        console.error('❌ Invalid FEN parameter:', fen);
        throw new Error('Invalid FEN parameter');
      }
      
      if (evalChange === undefined || evalChange === null || isNaN(evalChange) || !isFinite(evalChange)) {
        console.error('❌ Invalid evalChange parameter:', evalChange);
        throw new Error('Invalid evalChange parameter');
      }
      
      const response = await api.post('/games/even-move', { 
        fen, 
        eval_change: evalChange,
        skill_level: skillLevel, 
        move_time: moveTime 
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error getting even move:', error);
      // Log additional detail if it's an axios error
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        console.error('Request data sent:', {
          fen,
          eval_change: evalChange,
          skill_level: skillLevel,
          move_time: moveTime
        });
      }
      throw error;
    }
  },

  // Evaluate a position
  evaluatePosition: async (fen: string, depth?: number) => {
    try {
      if (!fen || typeof fen !== 'string') {
        console.error('❌ Invalid FEN parameter for evaluation:', fen);
        throw new Error('Invalid FEN parameter');
      }
      
      const response = await api.post('/games/evaluate', { fen, depth });
      
      if (!response.data || response.data.evaluation === undefined) {
        console.error('❌ Invalid evaluation response format:', response.data);
        throw new Error('Invalid response format from evaluation endpoint');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error evaluating position:', error);
      // Log additional detail if it's an axios error
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        console.error('Request data sent:', { fen, depth });
      }
      throw error;
    }
  },
};

// User API
export const userApi = {
  // Get current user profile
  getProfile: async () => {
    const response = await api.get('/users/me');
    return response.data;
  },

  // Update user profile
  updateProfile: async (data: { display_name?: string; elo_rating?: number }) => {
    const response = await api.patch('/users/me', data);
    return response.data;
  },
};

// Auth API
export const authApi = {
  // Register a new user
  register: async (email: string, password: string, displayName?: string) => {
    const response = await api.post('/auth/register', { email, password, display_name: displayName });
    return response.data;
  },

  // Login a user
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  // Logout a user
  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },
};

export default api; 