# Base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# The context . will be mounted via docker-compose during development.
# For production builds, we would copy files here.

CMD ["echo", "Nexus Dispatch Project Initialized"]
