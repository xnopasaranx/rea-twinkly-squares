# Multi-stage build for Twinkly Squares Controller
FROM node:20-slim AS builder
WORKDIR /app

# Backend dependencies & build
COPY backend/package*.json ./backend/
RUN cd backend && npm install
COPY backend ./backend
RUN cd backend && npm run build

# Frontend dependencies & build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend ./frontend
RUN cd frontend && npm run build

# Runtime image
FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=8080
ENV TWINKLY_DEFAULT_IP=192.168.2.50
ENV DATA_DIR=/data

EXPOSE 8080
VOLUME ["/data"]

CMD ["node", "backend/dist/index.js"]
