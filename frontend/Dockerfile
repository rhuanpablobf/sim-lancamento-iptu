FROM node:22-bookworm

WORKDIR /app

# Instalar dependências básicas
RUN apt-get update && apt-get install -y libc6 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Instala as dependências garantindo que binários nativos sejam baixados para linux-x64
RUN npm install

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Forçar o build clássico (Webpack) para evitar problemas com lightningcss/turbopack no Alpine/Debian
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
