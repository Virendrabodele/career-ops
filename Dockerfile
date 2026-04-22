FROM mcr.microsoft.com/playwright:v1.58.1-noble

WORKDIR /opt/render/project/src

COPY package.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PORT=10000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 10000

CMD ["npm", "run", "start"]
