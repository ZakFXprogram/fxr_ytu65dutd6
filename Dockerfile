# FXR OrderFlow — one image: Angular built into static files, served by the NestJS backend.
# Node 22 is required for the built-in node:sqlite module (no native build needed).

# 1) Build the Angular frontend
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2) Build the NestJS backend
FROM node:22-alpine AS backend
WORKDIR /be
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

# 3) Runtime image
FROM node:22-alpine
RUN addgroup -S fxr && adduser -S fxr -G fxr
WORKDIR /app
COPY --from=backend /be/dist ./dist
COPY --from=backend /be/node_modules ./node_modules
COPY --from=backend /be/package.json ./package.json
# the Angular build is served from /app/public (see app.module frontendDir)
COPY --from=frontend /fe/dist/frontend/browser ./public
ENV NODE_ENV=production
ENV DATA_DIR=/data
USER fxr
EXPOSE 8080
CMD ["node", "dist/main.js"]
