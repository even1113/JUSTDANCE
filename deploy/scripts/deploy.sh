#!/usr/bin/env sh
set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$project_dir"

env_file="${ENV_FILE:-deploy/.env.production}"

if [ ! -f "$env_file" ]; then
  echo "Missing $env_file. Copy deploy/.env.production.example and fill in the deployment values."
  exit 1
fi

docker compose \
  --env-file "$env_file" \
  -f docker-compose.yml \
  -f deploy/docker-compose.aliyun.yml \
  up -d --build

docker compose \
  --env-file "$env_file" \
  -f docker-compose.yml \
  -f deploy/docker-compose.aliyun.yml \
  ps

echo "Deployment started. Verify ${PUBLIC_BASE_URL:-your-public-base-url}/api/health/ready after the proxy is active."
