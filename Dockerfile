# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# The context . will be mounted via docker-compose during development.
# Install dependencies
COPY package*.json ./
RUN npm install && npm rebuild better-sqlite3

CMD ["npm", "run", "dev"]
