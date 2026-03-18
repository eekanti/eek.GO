FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && apk del python3 make g++
COPY server.js .
COPY db.js .
COPY --from=builder /app/dist ./dist
RUN mkdir -p /data
EXPOSE 3500
CMD ["node", "server.js"]
