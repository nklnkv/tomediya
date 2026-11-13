FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs lib.mjs qtickets.mjs ./
COPY public ./public
USER node
CMD ["node", "server.mjs"]
