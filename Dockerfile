# Nexus Dispatch production image
FROM node:20-alpine AS root-deps
WORKDIR /app
RUN apk add --no-cache openssl python3 make g++
COPY package*.json ./
RUN npm ci

FROM root-deps AS webui-build
WORKDIR /app/src/webui
COPY src/webui/package*.json ./
RUN npm ci
COPY src/webui ./
RUN npm run build

FROM root-deps AS api-build
WORKDIR /app
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json jest.config.js ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl tini
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=api-build /app/dist ./dist
COPY scripts ./scripts
RUN chmod +x /app/scripts/docker-entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/sbin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["api"]

FROM nginx:1.27-alpine AS webui
COPY --from=webui-build /app/src/webui/dist /usr/share/nginx/html
EXPOSE 80
