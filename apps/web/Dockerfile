FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install
COPY apps/web ./apps/web
RUN npm run build --workspace @oremus/web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --omit=dev
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/src/views ./apps/web/src/views
RUN mkdir -p ./apps/web/uploads
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "dist/server.js"]

# Media worker: same code, plus ffmpeg for video transcoding.
FROM runtime AS media
RUN apk add --no-cache ffmpeg
CMD ["node", "dist/media-worker.js"]
