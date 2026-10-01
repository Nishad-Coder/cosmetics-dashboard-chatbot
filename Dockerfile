FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
ENV CHATBOT_PYTHON=python3
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "server.js"]
