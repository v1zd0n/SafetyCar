#!/usr/bin/env bash
# Build the landing and publish it to https://safetycar.invent2025.org (wp-host, Virtualmin user "safetycar").
# Usage: bash scripts/deploy.sh [ssh-host]      (default ssh host: wp-host)
# Needs .env with VITE_MAPBOX_TOKEN (otherwise the map stays blank).
set -euo pipefail
HOST=${1:-wp-host}
WEBROOT=/data/home/safetycar/public_html
cd "$(dirname "$0")/.."

grep -qs '^VITE_MAPBOX_TOKEN=pk\.' .env || echo "warning: no VITE_MAPBOX_TOKEN in .env, the map will not load" >&2

npm ci --no-audit --no-fund
npm run build

# Apache: compression + long cache for hashed assets, no cache for index.html.
cat > dist/.htaccess <<'EOF'
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json application/geo+json image/svg+xml
</IfModule>
AddType application/geo+json .geojson
AddType model/gltf-binary .glb
<IfModule mod_headers.c>
  <FilesMatch "\.(js|css|woff2?|glb|png|jpe?g|webp|avif)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "^(index\.html)?$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
Options -Indexes
EOF

TARBALL=$(mktemp -t safetycar-dist.XXXXXX.tgz)
tar -czf "$TARBALL" -C dist .
scp -q "$TARBALL" "$HOST:/tmp/safetycar-dist.tgz"
rm -f "$TARBALL"

# Unpack into a fresh dir as the site user, then swap it in (no half-deployed state).
ssh "$HOST" "sudo -u safetycar sh -c 'set -e; N=$WEBROOT.new; rm -rf \$N; mkdir \$N; tar -xzf /tmp/safetycar-dist.tgz -C \$N; chmod -R a+rX \$N; rm -rf $WEBROOT.old; mv $WEBROOT $WEBROOT.old; mv \$N $WEBROOT' && rm -f /tmp/safetycar-dist.tgz"

echo "https://safetycar.invent2025.org/ -> $(curl -sS -o /dev/null -w "%{http_code}" https://safetycar.invent2025.org/)"
