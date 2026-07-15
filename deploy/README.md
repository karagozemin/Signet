# Deploying Signet

A live Signet deploy is two pieces on one box:

1. **The bridge** — a Node service that runs the real mesh peers, voucher
   crypto, QVAC and on-chain settlement, exposing `/api` (REST) + `/ws`
   (WebSocket). This is the "secret weapon": the UI is a live window onto real
   events, nothing is faked.
2. **The static frontend** — the Vite build (`web/dist`), served by Nginx,
   which also reverse-proxies `/api` and `/ws` to the bridge on `127.0.0.1:8787`.

Because Nginx proxies both paths to the bridge on the same origin, the browser
needs **no** special config — it just talks to its own host. If you ever host
the bridge on a different domain, build the frontend with
`VITE_BRIDGE_URL=https://bridge.example.com`.

---

## 1. Prerequisites (Ubuntu droplet)

```bash
# Node 20+ (matches local dev)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git

# Foundry (anvil/forge) — the local-chain demo needs anvil on PATH
curl -L https://foundry.paradigm.xyz | bash
~/.foundry/bin/foundryup
```

## 2. Get the code + build contracts

```bash
sudo git clone https://github.com/karagozemin/Signet.git /opt/signet
cd /opt/signet
npm ci
npm run build:contracts        # produces out/ artifacts the bridge reads
```

## 3. Build the frontend

```bash
cd /opt/signet/web
npm ci
npm run build                  # -> web/dist
sudo mkdir -p /var/www/signet
sudo cp -r dist/* /var/www/signet/
```

## 4. Run the bridge as a service

```bash
sudo cp /opt/signet/deploy/signet-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now signet-bridge
journalctl -u signet-bridge -f      # confirm: "🌉 Signet bridge on ..."
```

### Local anvil vs. live Sepolia

- **Default (local anvil):** the bridge auto-spawns anvil per session. No
  secrets needed. Great for a self-contained demo.
- **Live Sepolia:** create `/opt/signet/.env`:

  ```
  RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
  PRIVATE_KEY=0x<funded-deployer-key>
  ```

  The systemd unit loads this automatically (`EnvironmentFile`). Restart with
  `sudo systemctl restart signet-bridge`.

## 5. Wire up Nginx

```bash
# edit SERVER_NAME to your domain/IP first
sudo cp /opt/signet/deploy/nginx.conf /etc/nginx/sites-available/signet
sudo ln -sf /etc/nginx/sites-available/signet /etc/nginx/sites-enabled/signet
sudo nginx -t && sudo systemctl reload nginx
```

Visit `http://SERVER_NAME` — the landing loads, and `/app` opens the live
theatre wired to the bridge.

## 6. HTTPS (recommended)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot rewrites the Nginx server block to `443` + auto-renews. The `/ws` proxy
upgrades to `wss://` transparently.

---

## Updating a live deploy

```bash
cd /opt/signet && sudo git pull
npm ci && npm run build:contracts
cd web && npm ci && npm run build && sudo cp -r dist/* /var/www/signet/
sudo systemctl restart signet-bridge
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `/app` stuck on "connecting" | bridge down — `journalctl -u signet-bridge -f` |
| `session/init` times out | anvil/foundry not on PATH; check the unit's `Environment=PATH` |
| WebSocket drops after a minute | Nginx `proxy_read_timeout` too low (config sets `1d`) |
| Sepolia txs fail | deployer out of ETH, or wrong `RPC_URL` (must be an RPC, not an explorer) |
| 404 on deep links | SPA fallback — the `location /` block must `try_files … /index.html` |
