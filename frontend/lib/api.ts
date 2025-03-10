import axios from 'axios';

// Create axios instance with base URL
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('supabase.auth.token');
  if (token) {
    const parsedToken = JSON.parse(token);
    config.headers.Authorization = `Bearer ${parsedToken.access_token}`;
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