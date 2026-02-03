# Build stage
FROM node:22-slim AS builder

# Get target architecture from Docker buildx
ARG TARGETARCH

# Tini version
ARG TINI_VERSION=v0.19.0

# Download tini in builder stage
# Note: Using --insecure due to potential SSL interception in build environments
RUN apt-get update && \
    apt-get install -y curl && \
    curl --insecure -fsSL "https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-${TARGETARCH}" -o /tini && \
    chmod +x /tini && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including dev dependencies for build)
RUN npm install

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build the TypeScript code
RUN npm run build

# Runtime stage
FROM node:22-slim

# Copy tini from builder stage
COPY --from=builder /tini /usr/bin/tini

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Set tini as entrypoint to handle signals properly
ENTRYPOINT ["/usr/bin/tini", "--", "/docker-entrypoint.sh"]
