# CHIETA backend API — production image.
FROM node:20-alpine
WORKDIR /app

# Install only production deps (cached unless package files change).
COPY package*.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

# Secrets (DB_*, SECRET_KEY) are injected at runtime via env — never baked in.
# The app fail-fasts if any required env var is missing.
CMD ["node", "server.js"]
