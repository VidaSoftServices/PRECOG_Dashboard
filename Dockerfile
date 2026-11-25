# 1) Build the Dashboard (Vite). The deploy workflow writes .env (VITE_API_BASE_URL) next to this file before the build.
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 2) Serve it with nginx (see nginx.conf: keep-alive longer than cloudflared's, /healthz, no-cache index.html, real 404 for a missing build file).
#    Request and error logs go to the container output: `docker logs dashboard`.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1
