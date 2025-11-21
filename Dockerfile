# 1. Base Image
# Using a lightweight Python version based on Debian
FROM python:3.9-slim

# 2. System Dependencies
# - perl: Required for the pgBadger analysis engine
# - openssh-client: Required for SSH tunneling and file transfer capabilities
RUN apt-get update && apt-get install -y \
    perl \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# 3. Working Directory
WORKDIR /app

# 4. Python Dependencies
# Copy requirements first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Application Code
# Copy the rest of the application source code
COPY . .

# 6. Permissions
# Grant execution rights to the pgBadger script (Critical for Linux containers)
RUN chmod +x tools/pgbadger.pl

# 7. Environment Variables
# FLASK_HOST: Tells the app it's running inside a container (binds to 0.0.0.0)
ENV FLASK_HOST=0.0.0.0
# PYTHONUNBUFFERED: Ensures logs are streamed immediately to the console
ENV PYTHONUNBUFFERED=1

# 8. Networking
# Expose the standard Flask port
EXPOSE 5000

# 9. Persistence
# Define volumes for data retention (Database and Reports)
VOLUME ["/app/data", "/app/static/reports"]

# 10. Entry Point
CMD ["python", "app.py"]