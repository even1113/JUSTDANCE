#!/usr/bin/env sh
set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$project_dir"

if [ ! -f .env ]; then
  echo "Missing .env. Copy deploy/.env.aliyun.example to .env and fill in the secrets."
  exit 1
fi

docker compose \
  --env-file .env \
  -f docker-compose.yml \
  -f deploy/docker-compose.aliyun.yml \
  up -d --build

docker compose \
  --env-file .env \
  -f docker-compose.yml \
  -f deploy/docker-compose.aliyun.yml \
  ps

echo "Deployment started. Verify https://${APP_DOMAIN:-your-domain}/api/health/ready after TLS and DNS are active."
