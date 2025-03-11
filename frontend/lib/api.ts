import axios from 'axios';

// Typecasting to avoid TS errors
type AxiosConfig = any;
type AxiosResp = any;
type AxiosErr = any;

// For type safety with process.env
declare const process: {
  env: {
    NEXT_PUBLIC_API_URL?: string;
  };
};

// Create axios instance with base URL
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request logging and error handling
api.interceptors.request.use((config: AxiosConfig) => {
  console.log(`API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config.data);
  return config;
});

api.interceptors.response.use(
  (response: AxiosResp) => {
    console.log(`API Response: ${response.status} ${response.config.url}`, response.data);
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
    const response = await api.post('/games/best-move', { fen, skill_level: skillLevel, move_time: moveTime });
    return response.data;
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