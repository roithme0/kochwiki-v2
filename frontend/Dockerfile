# syntax=docker/dockerfile:1

### Stage 1: compile and build angular ###
FROM node:22 AS build

ARG CONFIGURATION
ARG VERSION=0.0.0

ENV APP_VERSION=${VERSION}

# add source code
WORKDIR /usr/local/app
# Copy only necessary files to reduce context size
COPY package*.json /usr/local/app/
COPY .npmrc /usr/local/app/
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token)" npm ci

COPY ./ /usr/local/app/
RUN npm run build -- --configuration=${CONFIGURATION} --output-hashing=all

# # create user to avoid running as root <> must use root for node
# RUN useradd -m node
# USER node

### Stage 2: serve with nginx ###
FROM nginx:1.25

# copy build output to replace the default nginx content
COPY --from=build /usr/local/app/dist/angular/browser /usr/share/nginx/html

# use config file
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# # create user to avoid running as root <> must use root for nginx
# RUN useradd -m nginx
# USER nginx

EXPOSE 80

HEALTHCHECK --interval=5m --timeout=5s --start-period=1m --retries=3 CMD curl --fail http://localhost:80/
