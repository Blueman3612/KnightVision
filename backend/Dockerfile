FROM amazonlinux:2023

# Install Python and dependencies
RUN yum update -y && \
    yum install -y python3.9 python3-pip wget unzip git make gcc-c++ && \
    yum clean all

# Clone Stockfish repository and build it
RUN cd /tmp && \
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git && \
    cd Stockfish/src && \
    make -j build && \
    mkdir -p /usr/bin && \
    cp stockfish /usr/bin/ && \
    chmod +x /usr/bin/stockfish && \
    cd / && \
    rm -rf /tmp/Stockfish

# Set work directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install setuptools without upgrading pip (which is system managed)
RUN pip3 install --no-cache-dir setuptools wheel

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
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"] 