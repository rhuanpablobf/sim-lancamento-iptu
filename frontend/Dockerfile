FROM node:22-bookworm

WORKDIR /app

# Instalar dependências básicas
RUN apt-get update && apt-get install -y libc6 python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Forçar o download de binários para Linux x64 mesmo se o lock for de outra plataforma
RUN npm install --platform=linux --arch=x64

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_TURBOPACK=0

# Reconstruir o lightningcss para garantir o binário gnu correto
RUN npm rebuild lightningcss

# Build clássico
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
