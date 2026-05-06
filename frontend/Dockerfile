FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN ls -R src/lib
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
