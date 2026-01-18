FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY src/ ./src/

# Create output directory
RUN mkdir -p /app/hls_output

# Start the worker
CMD ["npm", "start"]
