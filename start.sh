#!/bin/bash

echo "=================================="
echo "Horizon Chat - Starting Services"
echo "=================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please edit .env file with your configuration before running again."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Generate Prisma client
echo "Generating Prisma client..."
cd packages/database
npx prisma generate
cd ../..

# Run migrations
echo "Running database migrations..."
cd packages/database
npx prisma migrate dev --name init
cd ../..

# Start both services
echo "Starting services..."
echo "Web: http://localhost:3000"
echo "API: http://localhost:4000"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Start server and web concurrently
npm run dev
