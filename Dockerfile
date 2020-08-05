FROM node:lts-alpine

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

RUN npm run seed:admin

EXPOSE 3030

ENV NODE_ENV=production

CMD [ "npm", "start" ]