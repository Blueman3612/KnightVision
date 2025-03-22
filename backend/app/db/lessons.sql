-- Lessons database schema

-- Create player_lessons table to store generated lessons
CREATE TABLE IF NOT EXISTS player_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES auth.users(id),
    lesson_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    position_fen TEXT NOT NULL,
    exercises JSONB NOT NULL DEFAULT '[]',
    associated_game_id UUID REFERENCES games(id),
    move_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE,
    score INTEGER,
    UNIQUE (player_id, position_fen, associated_game_id, move_number)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS player_lessons_player_id_idx ON player_lessons(player_id);

-- Create index for querying incomplete lessons
CREATE INDEX IF NOT EXISTS player_lessons_completed_idx ON player_lessons(player_id, completed);

-- Create index for associated games
CREATE INDEX IF NOT EXISTS player_lessons_game_id_idx ON player_lessons(associated_game_id);

-- Add comments for documentation
COMMENT ON TABLE player_lessons IS 'Stores personalized chess lessons generated for players based on their games';
COMMENT ON COLUMN player_lessons.id IS 'Unique identifier for the lesson';
COMMENT ON COLUMN player_lessons.player_id IS 'ID of the player this lesson is for';
COMMENT ON COLUMN player_lessons.lesson_type IS 'Type of the lesson (tactical, positional, etc.)';
COMMENT ON COLUMN player_lessons.title IS 'Title of the lesson';
COMMENT ON COLUMN player_lessons.content IS 'Markdown content of the lesson';
COMMENT ON COLUMN player_lessons.position_fen IS 'FEN notation of the critical position';
COMMENT ON COLUMN player_lessons.exercises IS 'JSON array of practice exercises';
COMMENT ON COLUMN player_lessons.associated_game_id IS 'ID of the game this lesson is based on';
COMMENT ON COLUMN player_lessons.move_number IS 'Move number in the game where the lesson applies';
COMMENT ON COLUMN player_lessons.created_at IS 'When the lesson was created';
COMMENT ON COLUMN player_lessons.completed IS 'Whether the player has completed the lesson';
COMMENT ON COLUMN player_lessons.score IS 'Score achieved by the player (0-100)';