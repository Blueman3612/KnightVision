-- Enhanced Move Annotations Table
CREATE TABLE IF NOT EXISTS enhanced_move_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    move_san VARCHAR(10) NOT NULL,
    move_uci VARCHAR(5) NOT NULL,
    fen_before TEXT NOT NULL,
    fen_after TEXT NOT NULL,
    evaluation_before FLOAT NOT NULL,
    evaluation_after FLOAT NOT NULL,
    evaluation_change FLOAT NOT NULL,
    classification VARCHAR(10) NOT NULL, -- "blunder", "mistake", "inaccuracy", "good", "great", "excellent"
    is_best_move BOOLEAN NOT NULL,
    is_book_move BOOLEAN NOT NULL DEFAULT FALSE,
    square_control_before JSONB NOT NULL,
    square_control_after JSONB NOT NULL,
    move_improvement TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tactical Motifs Table
CREATE TABLE IF NOT EXISTS tactical_motifs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    annotation_id UUID REFERENCES enhanced_move_annotations(id) ON DELETE CASCADE,
    motif_type VARCHAR(20) NOT NULL, -- "fork", "pin", "skewer", "discovered_check"
    piece VARCHAR(1) NOT NULL, -- Piece symbol ("P", "N", "B", "R", "Q", "K")
    piece_square VARCHAR(2) NOT NULL, -- Square of the piece (e.g., "e4")
    targets JSONB NOT NULL, -- Array of target squares
    move VARCHAR(5) NOT NULL, -- Move UCI notation
    description TEXT NOT NULL, -- Human-readable description
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Player Weakness Tracking Table
CREATE TABLE IF NOT EXISTS player_weakness_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    tactical_weakness JSONB, -- Array of move numbers with tactical mistakes
    positional_weakness JSONB, -- Array of move numbers with positional mistakes
    opening_weakness JSONB, -- Array of opening mistakes
    endgame_weakness JSONB, -- Array of endgame mistakes
    critical_positions JSONB, -- Array of critical move numbers
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update games table to track enhanced analysis
ALTER TABLE games ADD COLUMN IF NOT EXISTS enhanced_analyzed BOOLEAN DEFAULT FALSE;

-- Add RLS policies for the new tables
ALTER TABLE enhanced_move_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY enhanced_move_annotations_select_own ON enhanced_move_annotations
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM games
        WHERE games.id = enhanced_move_annotations.game_id AND games.user_id = auth.uid()
    ));

ALTER TABLE tactical_motifs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tactical_motifs_select_own ON tactical_motifs
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM enhanced_move_annotations
        JOIN games ON games.id = enhanced_move_annotations.game_id
        WHERE enhanced_move_annotations.id = tactical_motifs.annotation_id AND games.user_id = auth.uid()
    ));

ALTER TABLE player_weakness_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_weakness_reports_select_own ON player_weakness_reports
    FOR SELECT
    USING (auth.uid() = user_id);