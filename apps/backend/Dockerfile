FROM node:18-alpine

WORKDIR /app

# Copy root files if any (monorepo setup)
# For this setup:
COPY package.json .

# Copy packages
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Install root dependencies if any, or go to subfolders
WORKDIR /app/packages/shared
RUN npm install && npm run build

WORKDIR /app/apps/backend
RUN npm install
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start"]
