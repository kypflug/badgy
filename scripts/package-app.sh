#!/usr/bin/env bash
# Build everything and stage a self-contained deploy artifact (dist-deploy/ + dist-deploy.zip):
#   index.js   — bundled server (with @rto/shared inlined)
#   web/       — built SPA (served by the server in prod)
#   package.json + node_modules — the externalized runtime deps only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export STAGE="$ROOT/dist-deploy"

rm -rf "$STAGE" "$ROOT/dist-deploy.zip"
mkdir -p "$STAGE/web"

npm run build

cp packages/server/dist/index.js "$STAGE/index.js"
cp -R packages/web/dist/. "$STAGE/web/"

# Runtime package.json = server deps minus the bundled workspace package.
node -e '
  const fs = require("fs");
  const dep = { ...(require("./packages/server/package.json").dependencies || {}) };
  delete dep["@rto/shared"];
  const out = {
    name: "badgy",
    private: true,
    type: "module",
    main: "index.js",
    scripts: { start: "node index.js" },
    engines: { node: ">=20" },
    dependencies: dep,
  };
  fs.writeFileSync(process.env.STAGE + "/package.json", JSON.stringify(out, null, 2) + "\n");
'

( cd "$STAGE" && npm install --omit=dev --no-audit --no-fund --loglevel=error )
( cd "$STAGE" && zip -qr "$ROOT/dist-deploy.zip" . )

echo "packaged → $ROOT/dist-deploy.zip"
