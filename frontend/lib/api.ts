import axios from 'axios';
import supabase from './supabase';

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

// Add auth token to requests if available
api.interceptors.request.use(async (config: AxiosConfig) => {
  // Only run on client side
  if (typeof window !== 'undefined') {
    // Skip if Authorization header already exists
    if (config.headers?.Authorization) {
      return config;
    }
    
    try {
      // Try to get the current session token directly from supabase
      // This is the most reliable approach
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${sessionData.session.access_token}`;
          return config;
        }
      } catch (sessionError) {
        console.warn('Could not get Supabase session:', sessionError);
      }
      
      // Fallback to localStorage methods
      // The token storage location has changed in newer Supabase versions
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, '') || '';
      const tokenStr = localStorage.getItem('sb-' + supabaseUrl + '-auth-token');
      
      if (tokenStr) {
        try {
          const token = JSON.parse(tokenStr);
          if (token?.access_token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token.access_token}`;
            return config;
          }
        } catch (parseError) {
          console.warn('Error parsing token from localStorage:', parseError);
        }
      }
      
      // Try fallback to older format
      const oldToken = localStorage.getItem('supabase.auth.token');
      if (oldToken) {
        try {
          const parsedToken = JSON.parse(oldToken);
          if (parsedToken?.access_token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${parsedToken.access_token}`;
            return config;
          }
        } catch (parseError) {
          console.warn('Error parsing legacy token from localStorage:', parseError);
        }
      }
    } catch (err) {
      console.error('Error setting auth token:', err);
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
      const response = await api.post(endpoint, data);
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
  processUnannotatedGames: async (userId: string, accessToken?: string, forceRetry: boolean = false) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Use provided access token if available
      if (accessToken) {
        // Ensure token is properly formatted with Bearer prefix
        headers['Authorization'] = accessToken.startsWith('Bearer ') 
          ? accessToken 
          : `Bearer ${accessToken}`;
        
        console.log('Using explicit Authorization header:', headers['Authorization'].substring(0, 20) + '...');
      } else {
        console.log('No explicit access token provided for processUnannotatedGames');
      }
      
      // For this critical endpoint, use a direct fetch call to bypass any interceptor issues
      try {
        const response = await fetch(`${apiUrl}/games/process-unannotated`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ 
            user_id: userId,
            force_retry: forceRetry
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API Error: ${response.status}`, errorText);
          throw new Error(`API error: ${response.status}`);
        }
        
        return await response.json();
      } catch (fetchError) {
        console.error('❌ Fetch error in processUnannotatedGames:', fetchError);
        throw fetchError;
      }
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