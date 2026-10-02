# Lightweight Production Node.js LTS Container
FROM node:22-alpine AS production

# Install tzdata for accurate Asia/Bangkok local time
RUN apk add --no-cache tzdata
ENV TZ=Asia/Bangkok
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Install dependencies (only production)
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Expose server port
EXPOSE 3000

# Health check using standard /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "server.js"]
