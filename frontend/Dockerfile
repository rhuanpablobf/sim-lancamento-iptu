FROM node:22-bookworm

WORKDIR /app

# Instalar ferramentas de build para pacotes nativos
RUN apt-get update && apt-get install -y \
    libc6-dev \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# FORÇAR RESOLUÇÃO LIMPA NO LINUX (Ignora o lock do Windows)
RUN rm -f package-lock.json && npm install

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_TURBOPACK=0

# O script de build agora tem --turbo=false no package.json
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
