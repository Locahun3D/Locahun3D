#!/usr/bin/env bash
# sync-online-viewer.sh — builds the online-variant viewer and copies it
# (plus its vendor Spark file) into the locahun3d_online repo, replacing the
# old hand-patch-and-copy workflow. Does NOT commit or push in the online
# repo — review the diff there and commit yourself.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ONLINE_REPO="${1:-$DIR/../locahun3d_online}"

if [ ! -d "$ONLINE_REPO/.git" ]; then
  echo "FATAL: $ONLINE_REPO doesn't look like the locahun3d_online repo (no .git)." >&2
  echo "       Usage: bash sync-online-viewer.sh [path-to-locahun3d_online]" >&2
  exit 1
fi

echo "=== Checking locahun3d_online working tree is clean ==="
if [ -n "$(cd "$ONLINE_REPO" && git status --porcelain -- public/viewer)" ]; then
  echo "FATAL: locahun3d_online has uncommitted changes under public/viewer — resolve first." >&2
  exit 1
fi

echo "=== Building online-variant viewer ==="
node "$DIR/build.mjs" --online

if [ ! -f "$DIR/Locahun3D_OfflineViewer.online.html" ]; then
  echo "FATAL: build did not produce Locahun3D_OfflineViewer.online.html" >&2
  exit 1
fi

echo "=== Copying into locahun3d_online ==="
mkdir -p "$ONLINE_REPO/public/viewer/vendor"
cp "$DIR/Locahun3D_OfflineViewer.online.html" "$ONLINE_REPO/public/viewer/offline-viewer.html"
cp "$DIR/vendor/spark-2.0.0-workers16-incrtraverse.module.js" "$ONLINE_REPO/public/viewer/vendor/"

if [ ! -f "$ONLINE_REPO/public/viewer/offline-viewer.html" ] || \
   [ ! -f "$ONLINE_REPO/public/viewer/vendor/spark-2.0.0-workers16-incrtraverse.module.js" ]; then
  echo "FATAL: one or both files failed to copy — online repo may be in an inconsistent state." >&2
  exit 1
fi

echo "=== Done. Review the diff in $ONLINE_REPO before committing: ==="
(cd "$ONLINE_REPO" && git status --short -- public/viewer)
echo "SHA256: $(sha256sum "$ONLINE_REPO/public/viewer/offline-viewer.html" | cut -d' ' -f1)"
