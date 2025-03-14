# Chess Tutor

A comprehensive web application for personalized chess training that analyzes your games, identifies weaknesses, and provides tailored lessons and practice positions.

## Features

- Play against an adaptive Stockfish engine that matches your skill level
- Upload and analyze your chess games with detailed feedback
- Receive personalized lesson recommendations based on your weaknesses
- Practice with custom positions designed to address your specific needs
- Track your progress and improvement over time

## Tech Stack

### Frontend
- Next.js (React)
- TypeScript
- Tailwind CSS
- Chess.js for chess logic
- Chessground for interactive board visualization

### Backend
- FastAPI (Python)
- Stockfish chess engine
- Python-chess for PGN parsing and analysis

### Database & Authentication
- Supabase (PostgreSQL)
- Supabase Auth

## Recent Updates

### Column Rename: full_name → display_name
We've renamed the `full_name` column to `display_name` in the users table for better semantic accuracy. This change affects:

- Database schema
- User profile display
- Registration and login flows
- Player confirmations when uploading games

The migration file `supabase/migrations/20240625_fix_user_trigger.sql` updates the necessary triggers to maintain functionality after this change.

## Getting Started

### Prerequisites

- Node.js (v16+)
- Python (v3.9+)
- Docker and Docker Compose
- Stockfish chess engine
- Supabase account

### Environment Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chess-tutor.git
   cd chess-tutor
   ```

2. Create a `.env` file in the root directory with the following variables:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   ```

### Local Development

1. Start the development environment using Docker Compose:
   ```bash
   docker-compose up
   ```

2. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### Database Setup

1. Create a new Supabase project
2. Run the SQL schema from `backend/app/db/schema.sql` in the Supabase SQL editor
3. Apply any additional migrations from the `supabase/migrations` directory
4. Configure authentication in the Supabase dashboard

## Development Workflow

1. Backend development:
   - FastAPI server runs at http://localhost:8000
   - API documentation available at http://localhost:8000/docs
   - Changes to Python files will automatically reload the server

2. Frontend development:
   - Next.js development server runs at http://localhost:3000
   - Changes to React components will automatically reload the page

## Deployment

### Backend Deployment (AWS EC2)

1. Set up an EC2 instance with Docker installed
2. Clone the repository on the instance
3. Configure environment variables
4. Run the Docker container:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Frontend Deployment (AWS Amplify)

1. Connect your GitHub repository to AWS Amplify
2. Configure build settings:
   - Build command: `cd frontend && npm install && npm run build`
   - Output directory: `frontend/.next`
3. Configure environment variables in the Amplify console

## Project Structure

```
chess-tutor/
├── backend/                # FastAPI backend
│   ├── app/                # Application code
│   │   ├── api/            # API routes
│   │   ├── core/           # Core configuration
│   │   ├── db/             # Database models and utilities
│   │   ├── models/         # Pydantic models
│   │   ├── services/       # Business logic services
│   │   └── utils/          # Utility functions
│   ├── tests/              # Backend tests
│   ├── Dockerfile          # Backend Docker configuration
│   └── requirements.txt    # Python dependencies
├── frontend/               # Next.js frontend
│   ├── components/         # React components
│   ├── context/            # React context providers
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility libraries
│   ├── pages/              # Next.js pages
│   ├── public/             # Static assets
│   ├── styles/             # CSS styles
│   ├── types/              # TypeScript type definitions
│   ├── Dockerfile          # Frontend Docker configuration
│   └── package.json        # Node.js dependencies
├── supabase/               # Supabase configuration
│   └── migrations/         # SQL migration files
├── docker-compose.yml      # Docker Compose configuration
└── README.md               # Project documentation
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Stockfish](https://stockfishchess.org/) - The powerful open-source chess engine
- [python-chess](https://python-chess.readthedocs.io/) - Chess library for Python
- [Chessground](https://github.com/lichess-org/chessground) - Chess UI library
- [chess.js](https://github.com/jhlywa/chess.js) - Chess logic library for JavaScript 