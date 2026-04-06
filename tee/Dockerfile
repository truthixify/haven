# Haven Protocol - Phala TEE Service
# Build: docker build -t haven-tee .
# Run via docker-compose (see docker-compose.phala.yml)

FROM node:24-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build NestJS
RUN npm run build

EXPOSE 3000

ENTRYPOINT ["node", "dist/main.js"]
