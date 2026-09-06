FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY src ./src
EXPOSE 8090
CMD ["npm", "start"]
