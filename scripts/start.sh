#!/usr/bin/env bash
# Starts:
# - Docker services
# - Node.js backend
# - Rasa API + actions
# Stops everything cleanly on Ctrl+C

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PATH="$PROJECT_ROOT/venv"
BACKEND_APP="$PROJECT_ROOT/backend/app"
RASA_DIR="$PROJECT_ROOT/backend/rasa"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Load env vars
if [ -f "$PROJECT_ROOT/.env" ]; then
  source "$PROJECT_ROOT/.env"
fi

echo "activating Python venv..."
source "$VENV_PATH/bin/activate"

echo "starting Docker containers..."
cd "$DOCKER_DIR"
docker-compose up -d

echo "starting Node backend..."
cd "$BACKEND_APP"

NODE_CMD="node server.js"
if [ "$NODE_ENV" = "development" ]; then
  NODE_CMD="npx nodemon server.js"
fi

$NODE_CMD &
NODE_PID=$!

echo "starting Rasa actions server..."
cd "$RASA_DIR"
rasa run actions --port "${RASA_ACTIONS_PORT:-5055}" &
ACTIONS_PID=$!

echo "starting Rasa core server..."
rasa run \
  --port "${RASA_PORT:-5005}" \
  --enable-api \
  --cors "*" &
RASA_PID=$!

cleanup() {
  echo ""
  echo "stopping node..."
  kill $NODE_PID 2>/dev/null || true
  wait $NODE_PID 2>/dev/null || true

  echo "stopping rasa..."
  kill $ACTIONS_PID $RASA_PID 2>/dev/null || true
  wait $ACTIONS_PID $RASA_PID 2>/dev/null || true

  echo "deactivating venv..."
  deactivate || true

  echo "stopping docker containers..."
  cd "$DOCKER_DIR"
  docker-compose down

  exit 0
}

trap cleanup SIGINT SIGTERM EXIT
wait
