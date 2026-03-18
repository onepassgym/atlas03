FROM node:20-slim

# Install Chromium + all Playwright deps in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 \
    libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libatspi2.0-0 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium (no extra download)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create runtime dirs
RUN mkdir -p media/photos media/thumbnails logs

EXPOSE 8747

CMD ["node", "src/server.js"]
