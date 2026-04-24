# syntax=docker/dockerfile:1.7

###
# Stage 1: dependencies (cached)
###
FROM node:22-alpine3.20 AS deps

WORKDIR /app

# native module compatibility
RUN apk add --no-cache libc6-compat

# copy dependency manifests first
COPY package.json package-lock.json ./

# install production dependencies only
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev && \
    npm cache clean --force


###
# Stage 2: runtime
###
FROM node:22-alpine3.20 AS runtime

WORKDIR /app

# environment variables
ENV NODE_ENV=production
ENV PORT=4100
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV UV_THREADPOOL_SIZE=16

# security: run as non-root user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# copy runtime files only
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

# fix permissions
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4100

# container-level healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
CMD node -e "const http=require('http');const port=process.env.PORT||4100;const req=http.get({host:'127.0.0.1',port,path:'/health',timeout:3000},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1);});"

CMD ["node", "src/main/bootstrap.js"]