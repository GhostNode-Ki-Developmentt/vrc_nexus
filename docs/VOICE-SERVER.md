# Own STUN/TURN server for VRC Nexus voice calls (3.7)

Voice calls use WebRTC. To connect two people behind different routers, VRC Nexus needs a STUN/TURN server.
VRC Nexus uses **only your own server** – no public servers.

## 1. coturn on the Linux server (Debian/Ubuntu)

```bash
sudo apt-get install -y coturn
sudo sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
openssl rand -hex 32        # → shared secret (keep it private, never commit it)
```

`/etc/turnserver.conf` (replace the placeholders):

```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=<SHARED_SECRET>
realm=<your-domain>
server-name=<your-domain>
min-port=49152
max-port=65535
no-cli
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
# optional TLS (turns:) with a certificate, e.g. from Let's Encrypt:
# cert=/etc/letsencrypt/live/<your-domain>/fullchain.pem
# pkey=/etc/letsencrypt/live/<your-domain>/privkey.pem
```

```bash
sudo systemctl restart coturn
```

Open in the firewall/router: **3478 UDP+TCP**, **5349 TCP** (if TLS), **49152–65535 UDP**.

## 2. Tell the website (GhostNode) about it

The website hands out short-lived TURN credentials (6 h, bound to the Nexus account), so the shared
secret never reaches the app. Either set environment variables for PHP:

```
NEXUS_TURN_URLS=stun:<your-domain>:3478,turn:<your-domain>:3478?transport=udp,turn:<your-domain>:3478?transport=tcp
NEXUS_TURN_SECRET=<SHARED_SECRET>
```

or create `data/keys/turn.json` on the web server (the `data/` folder is not in git):

```json
{ "urls": ["stun:<your-domain>:3478", "turn:<your-domain>:3478?transport=udp", "turn:<your-domain>:3478?transport=tcp"],
  "secret": "<SHARED_SECRET>" }
```

## 3. Alternative: enter a server in the app

Chat → 📞 Calls → STUN/TURN server. This overrides the website's server for this PC
(user/password stored encrypted). Leave empty to use the website's server.
