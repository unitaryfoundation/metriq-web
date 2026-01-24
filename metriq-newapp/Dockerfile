# Multi-purpose image: serves the metriq-newapp static site via nginx.

FROM nginx:1.25-alpine

# Install Node.js so we can compile TypeScript and apply runtime config overrides
RUN apk add --no-cache nodejs npm

WORKDIR /usr/share/nginx/html

# Copy application files
COPY ./ /usr/share/nginx/html/

# Install TypeScript, then compile TS → JS
RUN npm install --no-save typescript @types/node \
 && npx tsc -p . \
 && npm cache clean --force

# Ensure entrypoint helper runs before nginx starts
COPY docker-entrypoint.d/ /docker-entrypoint.d/

# Expose nginx default port
EXPOSE 80

# nginx base image already sets CMD ["nginx", "-g", "daemon off;"]
