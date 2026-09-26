FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server.js blog.js sources.js newsroom-states.js index.html ./
COPY assets ./assets
COPY content ./content
RUN mkdir -p /app/.cache && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
