# Multi-purpose image: serves the metriq-newapp static site via nginx
# and (optionally) regenerates the Metabase embed token at container start.

FROM nginx:1.25-alpine

# Install Node.js so we can run the embed generator script if secrets are provided
RUN apk add --no-cache nodejs npm

WORKDIR /usr/share/nginx/html

# Copy application files
COPY ./ /usr/share/nginx/html/

# Install runtime dependency and TypeScript, then compile TS → JS
RUN npm install --no-save jsonwebtoken typescript @types/node \
 && npx tsc -p . \
 && npm cache clean --force

# Ensure entrypoint helper runs before nginx starts
COPY docker-entrypoint.d/ /docker-entrypoint.d/

# Expose nginx default port
EXPOSE 80

# nginx base image already sets CMD ["nginx", "-g", "daemon off;"]
