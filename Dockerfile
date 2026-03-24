FROM node:22-slim

WORKDIR /app

# Install server deps
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Install widget deps + build
COPY widget/package.json widget/package-lock.json ./widget/
RUN cd widget && npm ci
COPY widget/ ./widget/
RUN cd widget && npm run build

# Copy server source
COPY server/ ./server/

# Copy docs
COPY docs-seed/ ./docs-seed/

WORKDIR /app/server

EXPOSE ${PORT:-3000}

CMD ["npx", "tsx", "src/index.ts"]
