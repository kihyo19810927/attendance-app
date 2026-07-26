# Use official Node.js runtime as parent image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package definition files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose port (Cloud Run defaults to PORT 8080)
ENV PORT=8080
EXPOSE 8080

# Command to start application
CMD ["npm", "start"]
