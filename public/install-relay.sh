#!/bin/bash
set -e

# ============================================================
# POB Relay Installer
# Installs: Node.js 20 + Caddy (auto-SSL) + relay service
# Run as root on the DigitalOcean VPS
# ============================================================

DOMAIN="relay.peopleopinionbox.com"

echo "=== POB Relay Installer ==="
echo "Domain: $DOMAIN"
echo ""

# 1. Install Node.js 20
echo "[1/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
apt-get install -y nodejs >/dev/null 2>&1
echo "    Node.js $(node -v) installed."

# 2. Install Caddy (auto HTTPS via Let's Encrypt)
echo "[2/7] Installing Caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https >/dev/null 2>&1
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
apt-get update >/dev/null 2>&1
apt-get install -y caddy >/dev/null 2>&1
echo "    Caddy installed."

# 3. Create relay directory
echo "[3/7] Creating relay app..."
mkdir -p /opt/relay
cd /opt/relay
npm init -y >/dev/null 2>&1
npm install undici >/dev/null 2>&1

# 4. Write relay.js
echo "[4/7] Writing relay.js..."
cat > /opt/relay/relay.js << 'RELAYEOF'
const http = require('http');
const { ProxyAgent, fetch } = require('undici');

const RELAY_SECRET = process.env.RELAY_SECRET || '';
const PORT = parseInt(process.env.PORT || '3789', 10);

const server = http.createServer(async (req, res) => {
  // Health check (no auth)
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, time: Date.now() }));
    return;
  }

  // Only POST /forward is accepted
  if (req.method !== 'POST' || req.url !== '/forward') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Verify Bearer token
  const auth = req.headers.authorization;
  if (!RELAY_SECRET || auth !== `Bearer ${RELAY_SECRET}`) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Read request body
  let raw = '';
  for await (const chunk of req) raw += chunk;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const { url, method, headers, body: reqBody, proxyUrl } = payload;

  // Build fetch options
  const fetchOpts = { method: method || 'GET', headers: headers || {} };
  if (reqBody) fetchOpts.body = reqBody;
  if (proxyUrl) fetchOpts.dispatcher = new ProxyAgent(proxyUrl);

  try {
    const response = await fetch(url, fetchOpts);
    const respBody = await response.text();
    const respHeaders = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      status: response.status,
      body: respBody,
      headers: respHeaders,
    }));
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[relay] listening on 127.0.0.1:${PORT}`);
});
RELAYEOF

# 5. Generate relay secret
echo "[5/7] Generating relay secret..."
RELAY_SECRET=$(openssl rand -hex 32)
cat > /opt/relay/.env << ENVEOF
RELAY_SECRET=${RELAY_SECRET}
PORT=3789
ENVEOF

# 6. Configure Caddy (auto HTTPS)
echo "[6/7] Configuring Caddy for HTTPS..."
cat > /etc/caddy/Caddyfile << CADDYEOF
${DOMAIN} {
    reverse_proxy 127.0.0.1:3789
}
CADDYEOF

# 7. Create systemd service
echo "[7/7] Starting services..."
cat > /etc/systemd/system/relay.service << SVCEOF
[Unit]
Description=POB Relay
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/relay
EnvironmentFile=/opt/relay/.env
ExecStart=/usr/bin/node relay.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable relay >/dev/null 2>&1
systemctl start relay
systemctl restart caddy

echo ""
echo "============================================"
echo "  INSTALLATION COMPLETE"
echo "============================================"
echo ""
echo "Relay URL: https://${DOMAIN}"
echo ""
echo "COPY THIS SECRET (you need it for Lovable):"
echo ""
echo "  ${RELAY_SECRET}"
echo ""
echo "============================================"
echo ""
echo "Verify it works:"
echo "  curl https://${DOMAIN}/health"
echo ""
