FROM node:24-bookworm-slim

WORKDIR /app
COPY --chown=node:node . .

RUN mkdir -p /app/data/images /app/data/backups \
  && chown -R node:node /app/data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    DB_PATH=/app/data/gallery.sqlite \
    STORAGE_ROOT=/app/data/images \
    BACKUP_DIR=/app/data/backups

USER node
EXPOSE 3000

CMD ["node", "server/server.js"]
