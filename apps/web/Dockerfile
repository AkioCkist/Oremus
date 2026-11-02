FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install
COPY apps/web ./apps/web
RUN npm run build --workspace @oremus/web

# One-shot development tools. This stage keeps the TypeScript sources and dev
# dependencies so Compose can run the seed/migration scripts against the same
# MongoDB and uploads volume as the production containers.
FROM build AS seed
ENV NODE_ENV=development
WORKDIR /app/apps/web
CMD ["npm", "run", "seed"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --omit=dev
COPY --chown=node:node --from=build /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node --from=build /app/apps/web/public ./apps/web/public
COPY --chown=node:node --from=build /app/apps/web/src/views ./apps/web/src/views
COPY --chown=node:node --from=build /app/apps/web/src/admin/components ./apps/web/src/admin/components
RUN mkdir -p ./apps/web/uploads && chown -R node:node /app/apps/web/uploads
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

# Media worker: same code, plus ffmpeg for video transcoding.
FROM runtime AS media
USER root
RUN apk add --no-cache ffmpeg
USER node
CMD ["node", "dist/media-worker.js"]
