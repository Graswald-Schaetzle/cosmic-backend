# ---- build stage ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# ---- runtime stage ----
FROM node:22-alpine

WORKDIR /app

# Install only production dependencies (includes swagger-ui-express and dotenv
# which esbuild marks as external and must be available at runtime)
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
