# 1. Base Image: Lightweight Python
FROM python:3.9-slim

# 2. Install System Dependencies
# - perl: Required for pgBadger engine
# - openssh-client: Required for SSH tunneling and file transfer
RUN apt-get update && apt-get install -y \
    perl \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# 3. Set Working Directory
WORKDIR /app

# 4. Install Python Dependencies
# Copy requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy Application Code
COPY . .

# 6. Permissions
# Make the pgBadger script executable (Critical for Linux containers)
RUN chmod +x tools/pgbadger.pl

# 7. Environment Variables
# Tell Flask it's running inside Docker
ENV FLASK_HOST=0.0.0.0
# Ensure Python logs are streamed immediately (not buffered)
ENV PYTHONUNBUFFERED=1

# 8. Expose Port
EXPOSE 5000

# 9. Volumes (Data Persistence placeholders)
VOLUME ["/app/data", "/app/static/reports"]

# 10. Start Command
CMD ["python", "app.py"]