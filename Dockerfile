FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/prepare-mediapipe-assets.js ./scripts/prepare-mediapipe-assets.js
COPY vendor/mediapipe/pose_landmarker_lite.task ./vendor/mediapipe/pose_landmarker_lite.task
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY . .
RUN mkdir -p /app/data/media /app/data/work \
  && chown -R node:node /app

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=5173

EXPOSE 5173
USER node

CMD ["node", "server.js"]
