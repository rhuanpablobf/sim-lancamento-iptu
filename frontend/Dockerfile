FROM node:22-bookworm

WORKDIR /app

# Instalar dependências básicas
RUN apt-get update && apt-get install -y libc6 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# FORÇA A INSTALAÇÃO DO ZERO NO LINUX
RUN rm -f package-lock.json && npm install

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_TURBOPACK=0

# Build
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
