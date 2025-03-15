-- Add the 'cpu' column to the games table to indicate if the game was played against the tutor
ALTER TABLE games
  ADD COLUMN cpu BOOLEAN DEFAULT FALSE;

-- Add comment to explain the purpose of the column
COMMENT ON COLUMN games.cpu IS 'Indicates if the game was played against the Chess Tutor engine'; 