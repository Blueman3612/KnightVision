import apiClient from './apiClient';

export interface BestMoveResponse {
  move: string;
  evaluation?: number;
  ponder?: string;
}

/**
 * Retrieves the best move from Stockfish for a given position
 * @param fen - The FEN representation of the current position
 * @param skillLevel - The skill level to set Stockfish to (1-20)
 * @param moveTime - The amount of time in seconds Stockfish should spend thinking
 * @returns A promise that resolves to the best move response
 */
export const getBestMove = async (
  fen: string,
  skillLevel: number = 10,
  moveTime: number = 1.0
): Promise<BestMoveResponse> => {
  console.log(`Requesting best move for position: ${fen}`, { skillLevel, moveTime });
  
  const MAX_RETRIES = 3;
  let retries = 0;
  let lastError: any = null;
  
  while (retries < MAX_RETRIES) {
    try {
      const response = await apiClient.post('/games/best-move', {
        fen,
        skill_level: skillLevel,
        move_time: moveTime
      });
      
      console.log('Stockfish API response:', response.data);
      
      if (!response.data || !response.data.move) {
        throw new Error(`Invalid response from Stockfish API: ${JSON.stringify(response.data)}`);
      }
      
      return response.data;
    } catch (error: any) {
      lastError = error;
      retries++;
      
      // Log detailed error information
      console.error(`Error requesting best move (attempt ${retries}/${MAX_RETRIES}):`, error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      // If we have more retries to attempt, wait before retrying
      if (retries < MAX_RETRIES) {
        const delayMs = 1000 * retries; // Increase delay with each retry
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  console.error(`Failed to get best move after ${MAX_RETRIES} attempts`);
  throw lastError;
};

const gameApi = {
  getBestMove
};

export default gameApi; 