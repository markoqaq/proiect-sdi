FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy SSL certificates
COPY ssl/ /etc/nginx/ssl/

# Copy static files
COPY public/ /usr/share/nginx/html/

# Create HLS directory
RUN mkdir -p /usr/share/nginx/html/hls

# Expose ports (HTTP and HTTPS)
EXPOSE 80 443

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
