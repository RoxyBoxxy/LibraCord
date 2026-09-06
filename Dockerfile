FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci
COPY client client
RUN npm run build -w client

FROM node:24-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3002 \
    DATABASE_PATH=/app/data/libracord.db \
    UPLOADS_PATH=/app/uploads \
    CLIENT_DIST_PATH=/app/client/dist
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
