# Étage 1 : build (devDependencies nécessaires au build Angular)
FROM node:26-alpine AS build
WORKDIR /app
# scripts/ est copié avant `npm ci` : le postinstall (prepare-tikzjax.mjs) en a besoin.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
# Les environnements sont figés au BUILD (fileReplacements d'angular.json) :
# la cible est donc choisie ici. Défaut "production" ; le workflow de preprod
# passe --build-arg BUILD_CONFIGURATION=preprod (environment.preprod.ts).
ARG BUILD_CONFIGURATION=production
RUN npm run build -- --configuration "$BUILD_CONFIGURATION"

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
