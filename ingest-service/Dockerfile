FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY src/ ./src/

# Create output directory
RUN mkdir -p /app/hls_output

# Create SSL directory
RUN mkdir -p /app/ssl

# Expose ports
EXPOSE 3000 3001

# Start the service
CMD ["npm", "start"]
