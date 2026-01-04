# Dockerfile for Railway deployment - Python Flask API
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backtest_api.py .

# Expose port (Railway sets PORT env var)
EXPOSE 5001

# Run with gunicorn
CMD gunicorn backtest_api:app --bind 0.0.0.0:${PORT:-5001} --workers 1 --threads 4 --timeout 120

