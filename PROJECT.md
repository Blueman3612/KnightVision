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

#### 4.1.4 Game Annotation System
- **Square Control Metrics**: A comprehensive system for analyzing piece influence across the board
- Metrics tracked for each square (8×8 grid) include:
  - `white_control`: Number of white pieces attacking, defending, or controlling each square
  - `black_control`: Number of black pieces attacking, defending, or controlling each square
  - `white_control_material`: Total material value of white pieces controlling each square
  - `black_control_material`: Total material value of black pieces controlling each square

##### Data Structure Implementation
```
// 8×8 arrays (0-indexed from a1 to h8)
white_control = [
    [0, 0, 0, 0, 0, 0, 0, 0],  // a1-h1
    [0, 0, 0, 0, 0, 0, 0, 0],  // a2-h2
    // ...remaining rows
]

white_control_material = [
    [0, 0, 0, 0, 0, 0, 0, 0],  // a1-h1
    [0, 0, 0, 0, 0, 0, 0, 0],  // a2-h2
    // ...remaining rows
]

// Similar arrays for black_control and black_control_material
```

##### Material Values
Standard piece values used for material calculations:
- Pawn: 1
- Knight: 3
- Bishop: 3
- Rook: 5
- Queen: 9
- King: 0 (not factored into material calculations, but tracked for control)

##### Example Analysis
Consider a position where square e5 is controlled by:
- White pieces: Knight on c4, Bishop on g3, Pawn on d4
- Black pieces: Rook on e8, Pawn on f6

The control metrics for e5 would be:
- `white_control[4][4] = 3` (three white pieces)
- `white_control_material[4][4] = 7` (Knight 3 + Bishop 3 + Pawn 1)
- `black_control[4][4] = 2` (two black pieces)
- `black_control_material[4][4] = 6` (Rook 5 + Pawn 1)

This data provides valuable insights:
- White has numerical control advantage (+1 piece)
- White has material control advantage (+1 point)
- The square is contested but weighted toward white control

##### Analytical Applications
- **Space Control Analysis**: Identifying areas of the board dominated by each player
- **Piece Activity Evaluation**: Measuring how effectively pieces project influence
- **Attack Preparation Detection**: Recognizing build-up of control in specific regions
- **Weakness Identification**: Finding squares with imbalanced control ratios
- **Strategic Planning Guidance**: Suggesting areas to contest or strengthen control

##### Integration with Game Analysis
This annotation system will be integrated with the Game Analysis Engine to:
- Provide visual heat maps of board control
- Identify critical turning points where control shifted
- Detect patterns in a player's control tendencies
- Generate targeted exercises to improve positional understanding

##### Tactics Annotation Strategy
The Game Analysis Engine uses square control metrics to identify tactical motifs automatically. For tactics annotation, we focus exclusively on Stockfish's best moves, as tactical opportunities that aren't optimal are not prioritized for teaching purposes.

Keep in mind that many suboptimal edge cases to our tactic detection requirements will be ruled out by the necessity of an optimal evaluation.

###### Fork Detection
A fork occurs when a single piece simultaneously attacks two or more enemy pieces. Our detection algorithm applies the following criteria:

1. **Safety Check**: Verify the square the moved piece landed on has an opponent control value of 0 (undefended), ensuring the forking piece isn't immediately capturable.
2. **Multiple Targets**: Confirm at least two newly attacked squares contain pieces with favorable control ratios (i.e., attacker's control > defender's control).
3. **Safety Exception**: Allow forks where the landing square has opponent control > 0 if:
   - Attacker's control is greater than defender's control on that square, OR
   - Equal control but with lower material value at risk (e.g., pawn forks knight/bishop while defended by another pawn)
4. **Value Exception**: Allow targets with unfavorable control ratios if the material exchange would favor the attacker (e.g., knight attacking a queen or rook, pawn attacking a bishop)

**Example: Basic Knight Fork**
```
Position snippet:
Black king on g8, black queen on c8
White knight moves from d5 to e7

Analysis:
- Square e7 (landing square) has black_control[6][4] = 0 (criterion 1 satisfied)
- Knight now attacks king at g8 and queen at c8
- Both attacked pieces have white_control > black_control after the move
- Identified as a fork
```

The tactical annotation system will highlight these detected forks in the game analysis, providing players with concrete examples of tactical opportunities they either capitalized on or missed during play.

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