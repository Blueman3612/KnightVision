-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    elo_rating INTEGER DEFAULT 1200,
    games_played INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Games Table
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pgn TEXT NOT NULL,
    result VARCHAR(10),
    opponent_type VARCHAR(20) NOT NULL, -- 'stockfish', 'human'
    opponent_level INTEGER, -- For Stockfish games
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Weaknesses Table
CREATE TABLE IF NOT EXISTS user_weaknesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    weakness_type VARCHAR(50) NOT NULL, -- 'tactical', 'positional', 'opening', 'endgame'
    weakness_subtype VARCHAR(50), -- Specific weakness (e.g., 'pins', 'forks', 'isolated_pawns')
    severity INTEGER NOT NULL, -- 1-10 scale
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, weakness_type, weakness_subtype)
);

-- User Progress Table
CREATE TABLE IF NOT EXISTS user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- 'elo', 'accuracy', 'weakness_improvement'
    metric_value FLOAT NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lessons Table
CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    difficulty INTEGER NOT NULL, -- 1-5 scale
    topic VARCHAR(50) NOT NULL, -- 'tactical', 'positional', 'opening', 'endgame'
    subtopic VARCHAR(50), -- Specific topic (e.g., 'pins', 'forks', 'isolated_pawns')
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Lessons Table (for tracking completed lessons)
CREATE TABLE IF NOT EXISTS user_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT FALSE,
    score INTEGER, -- Optional score if lesson has exercises
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
);

-- RLS Policies

-- Users table policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON users
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY users_update_own ON users
    FOR UPDATE
    USING (auth.uid() = id);

-- Games table policies
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY games_select_own ON games
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY games_insert_own ON games
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- User Weaknesses table policies
ALTER TABLE user_weaknesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_weaknesses_select_own ON user_weaknesses
    FOR SELECT
    USING (auth.uid() = user_id);

-- User Progress table policies
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_progress_select_own ON user_progress
    FOR SELECT
    USING (auth.uid() = user_id);

-- Lessons table policies (public read)
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY lessons_select_all ON lessons
    FOR SELECT
    USING (true);

-- User Lessons table policies
ALTER TABLE user_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_lessons_select_own ON user_lessons
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY user_lessons_insert_own ON user_lessons
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_lessons_update_own ON user_lessons
    FOR UPDATE
    USING (auth.uid() = user_id); 