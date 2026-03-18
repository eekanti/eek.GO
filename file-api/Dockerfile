FROM node:20-slim
RUN apt-get update && apt-get install -y \
    chromium fonts-freefont-ttf ca-certificates \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY app.js .
EXPOSE 3456
CMD ["node", "app.js"]
