# EverySong — Deployment Guide

# Target: demo.bernie.studio/everysong on AWS Lightsail

## Prerequisites

- Node.js v22+ installed (via NVM)
- PM2 installed globally
- nginx running with demo.bernie.studio SSL cert (Certbot)
- SSH access to instance

---

## Step 1: Clone from GitHub

```bash
ssh ubuntu@<your-lightsail-ip>
cd ~
git clone https://github.com/yourusername/everysong.git
cd everysong
```

Or if uploading manually via SFTP, place all files at `/home/ubuntu/everysong/`.

---

## Step 2: Install dependencies

```bash
cd /home/ubuntu/everysong
npm install --ignore-scripts
```

The `--ignore-scripts` flag avoids native module compilation. This project uses only pure-JS dependencies plus Node's built-in sqlite module.

---

## Step 3: Seed the database

Run each artist seed script separately:

```bash
# BTS — 386 songs
node --experimental-sqlite scripts/seed-bts.js

# Pet Shop Boys — 350 songs
node --experimental-sqlite scripts/seed-psb.js
```

Or seed all at once:

```bash
npm run seed:all
```

Each script will:

- Create the SQLite database at `/home/ubuntu/everysong/db/everysong.db`
- Import all songs from the CSV
- Fetch album art from the iTunes API (requires outbound HTTPS; takes 1-2 mins per artist)

Expected output per script:

```
✅ Artist inserted
✅ Inserted N songs
🎨 Fetching album art...
🎉 Seed complete!
```

---

## Step 4: Start with PM2

```bash
cd /home/ubuntu/everysong
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # follow the printed command to enable on reboot
```

Logs are written to `/home/ubuntu/everysong/logs/` — no sudo required.

Verify it is running:

```bash
pm2 status
pm2 logs everysong --lines 20
curl http://localhost:3010/everysong/
```

---

## Step 5: Configure nginx

Open your nginx site config:

```bash
sudo nano /etc/nginx/sites-available/demo.bernie.studio
```

Find your existing server block for demo.bernie.studio (the HTTPS one on port 443).
Add the contents of nginx-snippet.conf INSIDE that server block, before the closing }.

Example:

```nginx
server {
    listen 443 ssl;
    server_name demo.bernie.studio;

    # Your existing locations
    location /underthehood { ... }

    # ADD THIS
    location /everysong {
        proxy_pass         http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 30s;
    }
}
```

Test and reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 6: Verify

```bash
curl -I https://demo.bernie.studio/everysong/
curl -I https://demo.bernie.studio/everysong/bts
curl -I https://demo.bernie.studio/everysong/petshopboys
```

All should return HTTP 200.

Open in browser:

- https://demo.bernie.studio/everysong/ Landing page
- https://demo.bernie.studio/everysong/bts BTS gallery
- https://demo.bernie.studio/everysong/petshopboys Pet Shop Boys gallery

---

## Adding a New Artist

1. Prepare a CSV at scripts/yourartist_discography.csv with columns:
   song_name, album, sung_by, year_released, highlights

2. Copy an existing seed script and update the artist details:

```bash
cp scripts/seed-bts.js scripts/seed-yourartist.js
# Edit: slug, name, description, country, genre, formed_year, CSV filename, iTunes search name
```

3. Add an npm script to package.json:

```json
"seed:yourartist": "node --experimental-sqlite scripts/seed-yourartist.js"
```

4. Run on the server:

```bash
node --experimental-sqlite scripts/seed-yourartist.js
pm2 restart everysong
```

5. Their page appears automatically at /everysong/yourslug

See README.md for full CSV format and field documentation.

---

## Maintenance

```bash
# View logs
pm2 logs everysong

# Restart after code changes (pull from GitHub first)
git pull origin main
pm2 restart everysong

# Monitor memory/CPU
pm2 monit

# Re-seed an artist (wipes and reloads their songs)
node --experimental-sqlite scripts/seed-bts.js
pm2 restart everysong
```

---

## File Structure

```
/home/ubuntu/everysong/
├── server.js                    Express app (port 3010)
├── ecosystem.config.js          PM2 config
├── package.json
├── nginx-snippet.conf           nginx location block
├── README.md
├── DEPLOY.md                    This file
│
├── db/
│   ├── database.js              SQLite init + connection singleton
│   └── everysong.db             SQLite database (created by seed scripts)
│
├── scripts/
│   ├── seed-bts.js              BTS seeder
│   ├── seed-psb.js              Pet Shop Boys seeder
│   ├── bts_complete_discography.csv
│   └── psb_complete_discography.csv
│
├── views/
│   ├── index.ejs                Landing page
│   ├── artist.ejs               Artist gallery + filters
│   └── 404.ejs
│
├── public/
│   ├── css/
│   │   ├── main.css             Shared styles + dark/light theme
│   │   └── artist.css           Gallery, cards, filters, pagination
│   └── js/
│       ├── theme.js             Dark/light toggle
│       └── artist.js            Filters, view toggle, art loading
│
└── logs/
    ├── out.log                  PM2 stdout
    └── error.log                PM2 stderr
```

---

## Port Reference (Lightsail instance)

| Port | Service                        |
| ---- | ------------------------------ |
| 3010 | EverySong                      |
| ...  | Your other services (examples) |

Port 3010 should NOT be exposed publicly in Lightsail firewall rules — nginx proxies it internally. Only ports 80 and 443 need to be open.
