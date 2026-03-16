#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📦 Hämtar senaste versionen från git..."
cd "$REPO_DIR"
git pull

echo "🔨 Bygger och startar om container..."
docker compose build --no-cache && docker compose up -d

echo "✅ Klart!"
docker compose ps
