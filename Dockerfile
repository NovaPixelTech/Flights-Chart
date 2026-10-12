# Backend image for the Cheap Flights Finder Flask API.
# Works on Zeabur, SnapDeploy, Caasify, Cloud Run, or any Docker host.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# Dependencies first so Docker layer-caching speeds up rebuilds.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./
COPY templates ./templates

EXPOSE 8080

# A single search can take a while (many sequential Google requests), so the
# worker timeout is generous. Threads let concurrent requests share the process
# without extra RAM on tiny free instances.
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 300"]