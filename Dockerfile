# Étage 1 : build (devDependencies nécessaires au build Angular)
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Configuration production par défaut : les environnements sont figés au build.
RUN npm run build

# Étage 2 : runtime — server.mjs est auto-porté (Express bundlé par le builder),
# aucun node_modules requis.
FROM node:26-alpine
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/OpenCartableFront ./dist/OpenCartableFront
USER node
EXPOSE 4000
CMD ["node", "dist/OpenCartableFront/server/server.mjs"]
