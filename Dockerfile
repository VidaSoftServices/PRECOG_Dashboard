# Use an official Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Build the React app
RUN npm run build

# Install a simple HTTP server to serve the build
RUN npm install -g serve

# Expose port 8432
EXPOSE 8432

# Start the server
CMD ["serve", "-s", "dist", "-l", "3000"]
