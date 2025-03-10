FROM amazonlinux:2023

# Install Python and dependencies
RUN yum update -y && \
    yum install -y python3.9 python3-pip wget && \
    yum clean all

# Download pre-compiled Stockfish binary
RUN wget https://stockfishchess.org/files/stockfish-16-linux.zip -O stockfish.zip || true && \
    if [ ! -s stockfish.zip ]; then \
        wget https://github.com/official-stockfish/Stockfish/raw/master/src/stockfish -O stockfish && \
        mkdir -p /usr/bin && \
        mv stockfish /usr/bin/ && \
        chmod +x /usr/bin/stockfish; \
    fi

# Set work directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Set environment variables
ENV PYTHONPATH=/app
ENV STOCKFISH_PATH=/usr/bin/stockfish

# Expose port
EXPOSE 8000

# Command to run the application
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"] 