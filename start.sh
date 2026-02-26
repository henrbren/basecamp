#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node &>/dev/null; then
  # Try common Node.js locations
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

if ! command -v node &>/dev/null; then
  echo "Error: Node.js not found. Please install Node.js 18+ first."
  echo "Visit https://nodejs.org or use nvm: https://github.com/nvm-sh/nvm"
  exit 1
fi

echo "Starting Basecamp..."
node server.js
