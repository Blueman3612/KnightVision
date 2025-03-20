# Knight-Vision Backend Development Guide

## Build & Run Commands
- Build with Docker: `docker compose build`
- Run application: `docker compose up`
  - Frontend available at: `localhost:3000`
  - Backend available at: `localhost:80`
- Local development server: `python -m uvicorn app.main:app --reload`
- Format code: `black .`
- Sort imports: `isort .`
- Type check: `mypy .`
- Lint code: `black . && isort . && mypy .`

## Code Style Guidelines
- PEP 8 compliant with Black formatter (version 23.3.0)
- Type annotations for all function parameters and return values
- Import organization: standard lib → third party → local applications
- Use descriptive variable/function names in snake_case
- Classes in PascalCase
- Exception handling: use specific exceptions with meaningful error messages
- Documentation: Docstrings using Google style format
- Environment variables accessed through settings module (app.core.config)
- Async/await for all IO-bound operations

## Project Structure
FastAPI application for chess analysis with Stockfish integration.
Standard evaluation depth of 12 used across all position analysis for consistency.