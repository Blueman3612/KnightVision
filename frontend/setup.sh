#!/bin/sh

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Make sure tailwind is installed
echo "Ensuring Tailwind CSS is set up correctly..."
npx tailwindcss -i ./styles/globals.css -o ./styles/tailwind.css

# Start the development server
echo "Starting the development server..."
npm run dev 