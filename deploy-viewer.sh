#!/usr/bin/env bash
# deploy-viewer.sh — ビューアーを Cloudflare Worker にデプロイ
#
# 使い方:
#   cd "F:\Htlml\3DGS\Locahun3D"
#   bash deploy-viewer.sh
#
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$DIR/viewer-dist"

echo "=== Building single-file viewer ==="
node "$DIR/build.mjs"

echo "=== Syncing viewer-dist ==="
cp "$DIR/index.html"                       "$DIST/"
cp "$DIR/Locahun3D_OfflineViewer.html"     "$DIST/"
cp "$DIR/version.json"                     "$DIST/"
cp "$DIR/favicon.ico"                      "$DIST/"
cp "$DIR/favicon.svg"                      "$DIST/"
cp "$DIR/favicon.png"                      "$DIST/"
cp "$DIR/apple-touch-icon.png"             "$DIST/"
cp -r "$DIR/figures/"                      "$DIST/figures/"

echo "=== Deploying to Cloudflare ==="
cd "$DIR"
npx wrangler deploy

echo "=== Done ==="
echo "SHA256: $(sha256sum "$DIST/Locahun3D_OfflineViewer.html" | cut -d' ' -f1)"
