FROM node:20-slim
RUN apt-get update && apt-get install -y \
    chromium fonts-freefont-ttf ca-certificates git \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN git config --global user.email "pipeline@eek.go" && \
    git config --global user.name "eek.GO Pipeline" && \
    git config --global init.defaultBranch main
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY app.js .
EXPOSE 3456
CMD ["node", "app.js"]
