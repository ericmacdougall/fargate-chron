FROM node:latest


WORKDIR /fargate-chron
COPY . /fargate-chron

COPY package.json .
RUN npm install

ENTRYPOINT ["node"]
CMD ["cron.js"]