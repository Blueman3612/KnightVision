FROM python:3.9-slim

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    stockfish \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Set environment variables
ENV PYTHONPATH=/app
ENV STOCKFISH_PATH=/usr/games/stockfish

# Expose port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"] 