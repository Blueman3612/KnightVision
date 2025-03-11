import axios from 'axios';

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
  };
};

// Determine if we're running in Docker/local development
const isDocker = process.env.NEXT_PUBLIC_DOCKER === 'true';
const isDevelopment = process.env.NODE_ENV === 'development';
const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');

// Set API URL based on environment
let apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

// Force local URL if we're in development/Docker
if (isDevelopment || isDocker) {
  apiUrl = 'http://localhost:80';
  console.log('⚠️ Development environment detected: Using local API URL:', apiUrl);
} 
// Ensure we don't try to use HTTPS for our backend URLs
else if (apiUrl.startsWith('http://') && (apiUrl.includes('api.knightvision.app') || apiUrl.includes('ec2-') || apiUrl.includes('compute-1.amazonaws.com'))) {
  console.log('🌐 Using HTTP for API URL:', apiUrl);
}
// Ensure HTTPS for other production environments, especially on Vercel
else if (apiUrl.startsWith('http://') && !apiUrl.includes('localhost')) {
  apiUrl = apiUrl.replace('http://', 'https://');
  console.log('🔒 Converting API URL to HTTPS for security:', apiUrl);
}

// Log the final API URL being used
console.log('🌐 API URL:', apiUrl);

// Create axios instance with base URL
const api = axios.create({
  baseURL: apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request logging and error handling
api.interceptors.request.use((config: AxiosConfig) => {
  const fullUrl = `${config.baseURL || ''}${config.url || ''}`;
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
api.interceptors.request.use((config: AxiosConfig) => {
  // Only run on client side
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('supabase.auth.token');
    if (token) {
      const parsedToken = JSON.parse(token);
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${parsedToken.access_token}`;
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

  // Get best move from Stockfish
  getBestMove: async (fen: string, skillLevel: number = 20, moveTime: number = 1.0) => {
    
    try {
      // Force HTTP endpoint for requests to EC2
      let endpoint = '/games/best-move';
      let config = {};
      
      // If we're in a secure context (HTTPS), but using EC2 URL, we need to handle mixed content
      if (typeof window !== 'undefined' && 
          window.location.protocol === 'https:' && 
          apiUrl.includes('ec2-')) {
        console.log('⚠️ Handling mixed content by using full HTTP URL');
        // Replace the relative endpoint with the full URL to ensure HTTP is used
        endpoint = `${apiUrl}/games/best-move`;
        // Use fetch API directly to bypass browser mixed content blocking
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fen, skill_level: skillLevel, move_time: moveTime }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
      }
      
      // Standard axios approach for non-mixed content
      const response = await api.post(endpoint, { fen, skill_level: skillLevel, move_time: moveTime }, config);
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

  // Evaluate a position
  evaluatePosition: async (fen: string, depth?: number) => {
    const response = await api.post('/games/evaluate', { fen, depth });
    return response.data;
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
  updateProfile: async (data: { full_name?: string; elo_rating?: number }) => {
    const response = await api.patch('/users/me', data);
    return response.data;
  },
};

// Auth API
export const authApi = {
  // Register a new user
  register: async (email: string, password: string, fullName?: string) => {
    const response = await api.post('/auth/register', { email, password, full_name: fullName });
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