-- Add comprehensive game metadata columns to the games table
ALTER TABLE games
  -- Core Game Identification Fields
  ADD COLUMN event TEXT,
  ADD COLUMN site TEXT,
  ADD COLUMN game_date DATE, -- Using game_date instead of date to avoid conflicts with SQL reserved words
  ADD COLUMN round TEXT, -- Using TEXT because rounds can be like "2", "Final", "Quarterfinal", etc.
  ADD COLUMN white_player TEXT,
  ADD COLUMN black_player TEXT,
  ADD COLUMN white_elo INTEGER,
  ADD COLUMN black_elo INTEGER,
  
  -- Additional Metadata
  ADD COLUMN eco TEXT, -- Encyclopedia of Chess Openings code
  ADD COLUMN time_control TEXT,
  ADD COLUMN termination TEXT,
  ADD COLUMN game_link TEXT,
  
  -- Technical Fields
  ADD COLUMN unique_game_id TEXT, -- Composite identifier for quick duplicate detection
  ADD COLUMN moves_only TEXT, -- Just the moves part of the PGN
  
  -- Time-specific fields for better uniqueness
  ADD COLUMN end_time TIMESTAMP,
  ADD COLUMN start_time TIMESTAMP,
  ADD COLUMN platform TEXT; -- Chess.com, Lichess, OTB, etc.

-- Add an index on unique_game_id for faster lookups
CREATE INDEX games_unique_game_id_idx ON games(unique_game_id);

-- Add an index on user_id and unique_game_id for quick duplicate checks per user
CREATE INDEX games_user_game_idx ON games(user_id, unique_game_id);