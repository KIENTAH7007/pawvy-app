#!/bin/bash
echo ""
echo " =============================="
echo "   PAWVY Business Manager"
echo " =============================="
echo ""

if [ ! -d "node_modules" ]; then
  echo " Installing server packages..."
  npm install
fi

if [ ! -d "client/node_modules" ]; then
  echo " Installing client packages..."
  cd client && npm install && cd ..
fi

if [ ! -d "client/dist" ]; then
  echo " Building app..."
  cd client && npm run build && cd ..
fi

echo " Starting Pawvy at http://localhost:3001"
echo ""
open http://localhost:3001 2>/dev/null || xdg-open http://localhost:3001 2>/dev/null &
node server/index.js
