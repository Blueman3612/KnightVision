# Chess Tutor Project Document

## 1. Project Overview

### 1.1 Project Description
The Chess Tutor is a comprehensive web application designed to provide personalized chess training. Unlike generic chess platforms, this application analyzes a user's chess games, identifies specific strengths and weaknesses in their play, and delivers tailored lessons and practice positions to address those weaknesses. Additionally, it offers adaptive gameplay by adjusting its playing strength to match the user's skill level.

### 1.2 Project Objectives
- Create an intuitive platform for chess improvement
- Implement sophisticated game analysis capabilities
- Deliver personalized learning content based on user weaknesses
- Provide adaptive practice through custom positions and gameplay
- Establish a scalable and maintainable technical foundation

### 1.3 Key Features
- PGN upload and analysis
- Strength/weakness identification
- Personalized lesson recommendations
- Custom practice position generation
- Adaptive strength gameplay (matching user's ELO)
- Progress tracking and improvement metrics

## 2. Technical Architecture

### 2.1 Architecture Overview
The application follows a modern three-tier architecture:
- **Frontend**: Client-facing interface built with Next.js
- **Backend API**: Server-side processing using FastAPI with Stockfish integration
- **Database**: User data and game storage using Supabase

![Architecture Diagram]
```
┌────────────┐     ┌─────────────┐     ┌─────────────┐
│            │     │             │     │             │
│  Next.js   │────▶│   FastAPI   │────▶│  Stockfish  │
│  Frontend  │◀────│   Backend   │◀────│   Engine    │
│            │     │             │     │             │
└────────────┘     └─────────────┘     └─────────────┘
       ▲                  ▲
       │                  │
       ▼                  ▼
┌─────────────────────────────────┐
│                                 │
│         Supabase                │
│  (Auth, Database, Storage)      │
│                                 │
└─────────────────────────────────┘
```

### 2.2 Technology Stack

#### 2.2.1 Frontend
- **Framework**: Next.js (React)
- **State Management**: React Context API / React Query
- **UI Components**: 
  - Tailwind CSS for styling
  - chess.js for chess logic
  - chessground for interactive board visualization
- **Build/Bundling**: Next.js built-in
- **Deployment**: AWS Amplify

#### 2.2.2 Backend
- **Framework**: FastAPI (Python)
- **Chess Engine**: Stockfish (server-side implementation)
- **Chess Libraries**: python-chess for PGN parsing and analysis
- **Containerization**: Docker
- **API Documentation**: Swagger/OpenAPI (built into FastAPI)
- **Deployment**: AWS EC2

#### 2.2.3 Database & Authentication
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (for PGN files)

## 3. Development Approach

### 3.1 MVP Development Strategy
The development follows a phased approach with early deployment:

#### Phase 1: Core Infrastructure (MVP)
- Basic Stockfish API deployed on EC2 via Docker
- Game playability against Stockfish in Next.js frontend
- Supabase integration for authentication and data storage
- Complete deployment pipeline establishment

#### Phase 2: Analysis Capabilities
- PGN upload and parsing
- Game analysis with Stockfish
- Basic strength/weakness identification
- Game storage and retrieval

#### Phase 3: Personalization Features
- Advanced weakness identification algorithms
- Lesson content creation and recommendation system
- Custom position generation based on user weaknesses
- Adaptive gameplay strength adjustment

#### Phase 4: Refinement
- UI/UX improvements
- Performance optimization
- Mobile responsiveness enhancements
- Advanced analytics and progress tracking

### 3.2 Development Workflow
1. **Local Development Environment**:
   - Frontend: Next.js development server
   - Backend: Docker containerized FastAPI with Stockfish
   - Database: Supabase project (development instance)

2. **Version Control**:
   - Git repository with feature branching model
   - Pull request review process

3. **Testing Strategy**:
   - Unit tests for backend logic (pytest)
   - Integration tests for API endpoints
   - Frontend component testing (React Testing Library)
   - Manual testing for chess-specific functionality

## 4. Detailed Implementation Plan

### 4.1 Backend Implementation

#### 4.1.1 Stockfish Integration
- Containerized Stockfish engine on EC2
- RESTful API endpoints for:
  - Game initiation
  - Move validation and execution
  - Position evaluation
  - Game state management
- UCI protocol implementation for Stockfish communication
- Configuration for variable playing strength

##### Stockfish Skill Level to ELO Rating Correlation
| Skill Level | Approximate ELO Rating |
|-------------|------------------------|
| 0           | ~1320-1350             |
| 1           | ~1470-1490             |
| 2           | ~1600                  |
| 3           | ~1740                  |
| 4           | ~1920                  |
| 5           | ~2200                  |
| 6           | ~2360                  |
| 7           | ~2500                  |
| 8           | ~2600                  |
| 9           | ~2700                  |
| 10          | ~2790                  |
| 11          | ~2855                  |
| 12          | ~2920                  |
| 13          | ~2970                  |
| 14          | ~3025                  |
| 15          | ~3070                  |
| 16          | ~3110                  |
| 17          | ~3140                  |
| 18          | ~3170                  |
| 19          | ~3190                  |
| 20          | ~3200+                 |

##### Adaptive Learning System
A key feature of the Chess Tutor's learning approach is the adaptive engine response system, implemented through specialized endpoints:

###### Even-Move Endpoint
The `games/even-move` endpoint maintains relative position evaluation rather than maximizing advantage, making it ideal for beginners:

- **Functionality**: When a player makes a move (potentially a blunder), this endpoint returns a move that attempts to restore the previous evaluation difference rather than maximizing the engine's advantage.

- **Parameters**:
  - `fen`: Current position in FEN notation after player's move
  - `eval_change`: Evaluation change from the player's last move (e.g., -2.5 for a blunder that changed position from +0.5 to -2.0)

- **Behavior**:
  - If a player blunders (e.g., position changes from +0.5 to -2.0), the engine doesn't punish with the most crushing response
  - Instead, it finds a move that restores the evaluation close to the previous relative advantage (+0.5)
  - If multiple moves can achieve this, it selects the one with closest evaluation

- **Example**:
  ```
  Initial position: +0.5 (player advantage)
  Player moves, new position: -2.0 (player blundered, now at disadvantage)
  eval_change: -2.5
  
  Engine analysis of available moves:
  Move A: Results in +0.6 (exceeds target of +0.5)
  Move B: Results in +0.4 (slightly below target of +0.5)
  Move C: Results in +3.0 (far exceeds target)
  
  Engine will choose Move A as it's closest to restoring the original advantage.
  ```

- **Benefits**:
  - Enables beginners to experience incremental improvement
  - Provides opportunity to recognize and learn from mistakes without immediate punishment
  - Delivers a more enjoyable learning experience while still maintaining challenge
  - Collects valuable data on player blunders and missed tactics for analysis

###### Standard Evaluation Depth
For consistency in analysis and engine responses, a standardized search depth of 12 is used across all position evaluations in the application. This depth:

- Provides sufficient tactical awareness for accurate evaluations
- Balances computational cost with evaluation accuracy
- Ensures consistent analysis quality across all app features
- Maintains reasonable response times on the server

#### 4.1.2 Game Analysis Engine
- PGN parsing and validation
- Move accuracy evaluation using Stockfish
- Pattern recognition for identifying:
  - Tactical weaknesses (missed forks, pins, etc.)
  - Positional weaknesses (pawn structure, piece activity)
  - Opening knowledge gaps
  - Endgame technique issues
- Statistical aggregation for identifying persistent weaknesses

#### 4.1.3 Lesson and Position Generation
- Mapping identified weaknesses to learning resources
- Algorithm for generating custom positions based on weakness categories
- Difficulty scaling system for adaptive learning

### 4.2 Frontend Implementation

#### 4.2.1 User Interface Components
- Interactive chessboard with move validation
- Game analysis viewer with evaluation graph
- Lesson display system with interactive exercises
- User dashboard with progress metrics
- Profile and settings management

#### 4.2.2 Key User Flows
1. **Game Analysis Flow**:
   - Upload PGN → Review analysis → View weakness report → Access recommended lessons
   
2. **Practice Flow**:
   - Select weakness area → Practice custom positions → Receive feedback → Track improvement

3. **Play Flow**:
   - Select playing mode/strength → Play against adaptive Stockfish → Review game analysis

### 4.3 Supabase Implementation

#### 4.3.1 Database Schema
- Users table (auth integration)
- Games table (PGN storage, analysis results)
- UserWeaknesses table (tracked weaknesses per user)
- UserProgress table (improvement metrics)
- Lessons table (content and metadata)

#### 4.3.2 Authentication Flow
- Email/password registration and login
- OAuth integration (Google, GitHub)
- Session management

## 5. Deployment Strategy

### 5.1 Backend Deployment (EC2)
1. **Docker Container Setup**:
   - Dockerfile for backend application
   - Docker Compose for local development
   - Docker image pushed to container registry

2. **EC2 Configuration**:
   - Instance sizing based on computational needs
   - Security group configuration
   - Docker installation and configuration
   - Container deployment and management
   - Environment variable management

3. **API Security**:
   - Rate limiting implementation
   - Authentication requirements
   - CORS configuration

### 5.2 Frontend Deployment (AWS Amplify)
1. **AWS Amplify Setup**:
   - GitHub repository connection
   - Build configuration
   - Environment variable configuration
   - Custom domain setup (if applicable)

2. **Deployment Pipeline**:
   - Automated builds on commit
   - Preview deployments for pull requests
   - Production deployment process

### 5.3 Deployment Testing
- Smoke testing after deployment
- Performance validation
- Security verification

## 6. Future Enhancements

### 6.1 Advanced Features
- Machine learning for more nuanced weakness detection
- Opening repertoire builder and trainer
- Multiplayer functionality with ELO tracking
- Video lessons integration
- Tournament organization

### 6.2 Scaling Considerations
- Backend horizontal scaling for increased user load
- Database performance optimization
- Caching implementation for common analysis requests
- CDN integration for static assets

## 7. Project Management

### 7.1 Development Timeline
- **Month 1**: MVP development and deployment
- **Months 2-3**: Analysis capabilities implementation
- **Months 4-5**: Personalization features development
- **Month 6**: Refinement and optimization

### 7.2 Risk Management
- **Technical Risks**:
  - Stockfish performance on EC2 (mitigation: appropriate instance sizing)
  - API latency (mitigation: optimization and caching)
  - Frontend performance with complex chess visualization (mitigation: code splitting, lazy loading)

- **Project Risks**:
  - Scope creep (mitigation: clear MVP definition, phased approach)
  - Integration complexity (mitigation: early and continuous integration testing)

## 8. Maintenance and Support

### 8.1 Monitoring
- AWS CloudWatch for backend performance
- Error tracking (Sentry integration)
- User analytics implementation

### 8.2 Updating
- Stockfish version updates
- Dependency management
- Security patches

### 8.3 Backup Strategy
- Database backup configuration
- Disaster recovery planning

---

This project document serves as a comprehensive blueprint for the Chess Tutor application development. It will be updated as the project progresses and requirements evolve.