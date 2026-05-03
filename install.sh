#!/usr/bin/env bash
set -e

echo "🚀 Starting Nexus Dispatch System one-click installation..."

INSTALL_DIR="/opt/nexus-dispatch"

if [ ! -d "$INSTALL_DIR" ]; then
    echo "📦 Cloning repository to $INSTALL_DIR..."
    git clone https://github.com/zcweah1981/Nexus-Dispatch.git "$INSTALL_DIR"
else
    echo "🔄 Repository already exists, pulling latest changes..."
    cd "$INSTALL_DIR" && git pull origin main
fi

cd "$INSTALL_DIR"

echo "⚙️ Initializing environment..."
if [ ! -f ".env" ]; then
    cp .env.example .env
fi
mkdir -p data

echo "🐳 Starting Docker containers (db, api, daemon, webui)..."
docker compose up -d --build

echo "✅ Installation complete!"
echo "🌐 WebUI Dashboard: http://localhost:3030"
echo "🔌 API Docs: http://localhost:8000/docs"