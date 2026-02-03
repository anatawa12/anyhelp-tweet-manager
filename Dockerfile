# Build stage
FROM node:22-slim AS builder

# Get target architecture from Docker buildx
ARG TARGETARCH

# Tini version and architecture-specific checksums
ARG TINI_VERSION=v0.19.0
ARG TINI_SHA256_AMD64=93dcc18adc78c65a028a84799ecf8ad40c936fdfc5f2a57b1acda5a8117fa82c
ARG TINI_SHA256_ARM64=07952557df20bfd2a95f9bef198b445e006171969499a1d361bd9e6f8e5e0e81

# Download and verify tini in builder stage
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    # Determine the correct tini binary and checksum based on architecture
    case "${TARGETARCH}" in \
        amd64) \
            TINI_ARCH="amd64"; \
            TINI_SHA256="${TINI_SHA256_AMD64}"; \
            ;; \
        arm64) \
            TINI_ARCH="arm64"; \
            TINI_SHA256="${TINI_SHA256_ARM64}"; \
            ;; \
        *) \
            echo "Unsupported architecture: ${TARGETARCH}"; \
            exit 1; \
            ;; \
    esac && \
    curl -fsSL "https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-${TINI_ARCH}" -o /tini && \
    echo "${TINI_SHA256}  /tini" | sha256sum -c - && \
    chmod +x /tini && \
    apt-get purge -y --auto-remove curl && \
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
