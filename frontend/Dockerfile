FROM node:22-bookworm

WORKDIR /app

# Instalar dependências básicas se necessário
RUN apt-get update && apt-get install -y libc6 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Limpar cache e instalar forçando a resolução de pacotes nativos
RUN npm install

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Desativa Turbopack que é experimental e está causando erro com lightningcss no build
RUN npx next build --no-turbo

EXPOSE 3000

CMD ["npm", "start"]
