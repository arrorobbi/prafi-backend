# Trans Niaga Server Guide

How the Trans Niaga (UMKM Prafi) server is set up and how to run, update and look after it. Written for whoever takes over the server.

> This guide holds no passwords or secrets. They live only in the two `.env` files on the server (see *Configuration*). Never commit `.env` files or paste their contents into chats or tickets.

## 1. Overview

| what | value |
|---|---|
| Server | VPS, Ubuntu 24.04 LTS, 6 CPU, 11 GB RAM, 193 GB disk |
| Public IP | `156.67.104.230` |
| Login | SSH as user `prafi` (port 22); `sudo` needs the `prafi` password |
| Website (frontend) | `https://transniaga.manokwarikab.go.id` |
| API (backend) | `https://api.transniaga.manokwarikab.go.id` |
| Public API docs | `https://api.transniaga.manokwarikab.go.id/docs` |
| This guide | Superadmin dashboard → **Panduan Server**, or `https://api.transniaga.manokwarikab.go.id/api/docs/server` (superadmin only) |
| Server panel (Webmin) | `https://core.transniaga.manokwarikab.go.id` |

How a visit reaches the apps:

| domain | nginx (port 443, HTTPS) sends it to | app |
|---|---|---|
| `transniaga.manokwarikab.go.id` | `127.0.0.1:80` | **prafi-frontend** (Next.js) |
| `api.transniaga.manokwarikab.go.id` | `127.0.0.1:4000` | **prafi-backend** (Express API + Socket.IO) |
| `core.transniaga.manokwarikab.go.id` | `127.0.0.1:10000` | Webmin |

Port 80 (plain HTTP) is held by the frontend itself, not by nginx. The browser calls `/api`, `/images` and `/socket.io` on the website's own domain; the frontend forwards them to the backend (`API_URL`), so the backend needs no CORS entry for the website.

## 2. Project directories

| path | what |
|---|---|
| `/home/prafi/project/prafi-backend` | Backend source (TypeScript). Git: `github.com/arrorobbi/prafi-backend` |
| `/home/prafi/project/prafi-frontend` | Frontend source (Next.js). Git: `github.com/arrorobbi/prafi-frontend` |

Inside **prafi-backend**:

| path | what |
|---|---|
| `src/` | Source code: `routes/` (URLs), `controllers/` (input checks), `services/` (logic), `models/` (database tables) |
| `dist/` | Compiled JavaScript that the service runs (made by `npm run build`; never edit) |
| `images/` | **Uploaded photos** (products, logos, profile photos, category images). Back it up together with the database |
| `db/migrations/` | SQL files that change the database structure, run once each in date order |
| `postman/` | Postman collection; source of the public API docs |
| `documentation/` | Generated public API docs (`npm run docs`) |
| `docs/SERVER-GUIDE.md` | This guide |
| `deploy/` | systemd unit, nginx config and setup scripts. **Only on the server, not in git yet** |
| `.env` | Backend settings and secrets |

Inside **prafi-frontend**:

| path | what |
|---|---|
| `src/app/` | Pages (one folder per URL) |
| `src/components/`, `src/lib/` | Shared UI and helpers (`lib/api.ts` = every API call) |
| `public/` | Static files (logo, guide pictures in `public/panduan/`) |
| `.next/` | Build output that the service runs (made by `npm run build`) |
| `docs/PANDUAN-PENGGUNA.md` | User guide for each role (Bahasa Indonesia) |
| `deploy/` | systemd unit, nginx configs, setup script |
| `.env` | Frontend settings |

## 3. Software

| software | version | used by |
|---|---|---|
| Node.js 22 (nvm, `~/.nvm/versions/node/v22.23.3`) | 22.23.3 | backend service; `node` / `npm` in your SSH shell |
| Node.js 18 (system, `/usr/bin/node`) | 18.19.1 | frontend service |
| Next.js | 15.5.27 (pinned) | frontend |
| PostgreSQL | 16 | database |
| nginx | 1.24 | HTTPS in front of the apps |
| certbot (snap) | | HTTPS certificates, renewed automatically |

> **Keep Next.js on 15.x.** Next.js 16 needs Node 20.9+, but the frontend service runs Node 18: after an upgrade the service crash-loops (`code=exited`). In particular, do not run `npm audit fix --force` in the frontend: it installs Next.js 16. To move to Next.js 16 later, first change `ExecStart` in the frontend service to the Node 22 path.

## 4. Services (start, stop, logs)

Both apps run as **systemd services** that start at boot and restart themselves if they crash (after 5 s).

| service | runs | port |
|---|---|---|
| `prafi-backend` | `node dist/server.js` (Node 22) in `prafi-backend/` | 4000 |
| `prafi-frontend` | `next start -p 80` (Node 18) in `prafi-frontend/` | 80 |
| `nginx` | HTTPS proxy | 443 |
| `postgresql` | database | 5432 (localhost only) |

Status, restart, stop and start:

```bash
systemctl status prafi-backend prafi-frontend
sudo systemctl restart prafi-backend
sudo systemctl restart prafi-frontend
sudo systemctl stop prafi-frontend
sudo systemctl start prafi-frontend
```

Logs (each request is one line; errors are printed in full):

```bash
journalctl -u prafi-backend -f            # follow live (Ctrl+C to quit)
journalctl -u prafi-backend -n 200        # last 200 lines
journalctl -u prafi-frontend --since "1 hour ago"
sudo tail -f /var/log/nginx/error.log
```

The superadmin dashboard also has **Log API**: every create / update / delete by signed-in users and every login attempt, with errors (kept `LOG_RETENTION_DAYS` days, default 30).

The service files are `/etc/systemd/system/prafi-backend.service` and `prafi-frontend.service` (copies in each project's `deploy/`). After changing one:

```bash
sudo systemctl daemon-reload
sudo systemctl restart prafi-backend
```

## 5. Updating the apps (deploy)

Changes are made on a git branch, reviewed in a pull request and merged into `main` on GitHub. Small fixes may go straight to `main`. The server then pulls `main` and rebuilds.

**Backend:**

```bash
cd /home/prafi/project/prafi-backend
git switch main && git pull
npm install                      # only when package.json changed
# run new files in db/migrations/ here, if any (section 7)
npm run build
sudo systemctl restart prafi-backend
journalctl -u prafi-backend -n 30   # should end with "Server running on ..."
```

**Frontend:**

```bash
cd /home/prafi/project/prafi-frontend
git switch main && git pull
npm install                      # only when package.json changed
npm run build                    # 1-2 minutes; the old version keeps running meanwhile
sudo systemctl restart prafi-frontend
```

Rules:

- If a change has a **database migration**, run it **before** restarting the backend (the new code expects the new tables). Back up first (section 7).
- If both apps changed, deploy the **backend first**.
- If `npm run build` fails, don't restart: the running version is untouched. Fix the error first.
- To undo a bad update: `git log --oneline` to find the previous commit, `git checkout <commit>`, build and restart; then go back with `git switch main` once fixed. A migration is not undone this way: restore the database backup instead.

Quick check after a deploy:

```bash
curl -s https://api.transniaga.manokwarikab.go.id/api/health     # {"success":true,"data":{"status":"ok"}}
curl -s -o /dev/null -w "%{http_code}\n" https://transniaga.manokwarikab.go.id/   # 200
```

## 6. Configuration (.env)

Each app reads its `.env` file at start. The backend reads it when the service starts (restart after a change). The frontend reads it at **build** time (run `npm run build` and restart after a change).

**Backend** `/home/prafi/project/prafi-backend/.env` (all names in `.env.example`):

| setting | meaning |
|---|---|
| `NODE_ENV` | `production` on the live server. With `development`, error responses include internal details (stack traces) |
| `PORT` | 4000 (nginx points here) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Database connection (section 7) |
| `JWT_SECRET` | Signs login tokens. Changing it logs everybody out. Long and random; never share |
| `JWT_EXPIRES_IN` | Login lifetime (`1h`) |
| `APP_URL` | The API's public address; used in image links |
| `FRONTEND_URL` | The website's address; used in email links (password reset) |
| `CORS_ORIGIN` | Other sites allowed to call the API from a browser (comma separated). The website itself doesn't need it |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Outgoing email (Gmail; `SMTP_PASS` is a Gmail *app password*). Without `SMTP_HOST`, emails are only printed in the log |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | The superadmin account made by `npm run db:seed` |
| `REVALIDATE_SECRET`, `FRONTEND_REVALIDATE_URL` | Lets the backend refresh the website's cached public pages right after a change; the same secret is in the frontend `.env` |
| `LOG_RETENTION_DAYS` | Days of API logs to keep (default 30) |
| `DB_LOGGING` | `true` prints every SQL query (debugging only) |

**Frontend** `/home/prafi/project/prafi-frontend/.env`:

| setting | meaning |
|---|---|
| `API_URL` | Backend address the website forwards to |
| `SITE_URL` | The website's own address (product links in WhatsApp messages). Default `https://transniaga.manokwarikab.go.id` |
| `NEXT_PUBLIC_ADMIN_WHATSAPP`, `NEXT_PUBLIC_ADMIN_EMAIL` | Contact shown in *Panduan → Hubungi Administrator* |
| `REVALIDATE_SECRET` | Same value as in the backend `.env` |

## 7. Database

| what | value |
|---|---|
| Engine | PostgreSQL 16 on this server, reachable only from the server itself (localhost) |
| Database | `prafi_db` |
| User | `postgres` (from `DB_USER`) |
| Password | `DB_PASSWORD` in the backend `.env` |
| Size | about 17 MB (plus uploaded images in `prafi-backend/images/`) |

Tables:

| table | holds |
|---|---|
| `users` | Accounts of every role (superadmin, disnakertrans, admin, tenant); passwords are hashed |
| `approvals` | Whether each account or product is active, and the reason |
| `tenants` | UMKM (shop) profiles, one per tenant account |
| `products` | Products, each owned by a tenant account and in one category |
| `product_categories` | Product categories with their carousel image |
| `reviews` | Visitors' product reviews (1-5 stars) |
| `images` | Uploaded images (the files are in `prafi-backend/images/`) |
| `notifications` | In-app notifications |
| `otps`, `revoked_tokens` | Email verification codes; logged-out tokens |
| `api_logs` | The Log API records |

Open the database console (the password is read from `.env`, so it is never typed or shown):

```bash
cd /home/prafi/project/prafi-backend
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" psql -h localhost -U postgres -d prafi_db
```

Inside: `\dt` lists tables, `\d products` shows a table, `\q` quits. Only read (`SELECT`) here unless you know exactly what a change does; the apps keep the data consistent.

**Backup** (do this before every migration, and regularly):

```bash
cd /home/prafi/project/prafi-backend
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" pg_dump -h localhost -U postgres prafi_db > ~/backup_prafi_db_$(date +%F).sql
tar czf ~/backup_images_$(date +%F).tar.gz images
```

Copy backups off the server too (e.g. `scp` to your computer). **There are no automatic backups yet.** A daily cron job is a good first improvement.

**Restore** a backup (replaces all current data: stop the backend first):

```bash
sudo systemctl stop prafi-backend
cd /home/prafi/project/prafi-backend
export PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)"
dropdb -h localhost -U postgres prafi_db
createdb -h localhost -U postgres prafi_db
psql -h localhost -U postgres -d prafi_db -f ~/backup_prafi_db_YYYY-MM-DD.sql
sudo systemctl start prafi-backend
```

**Migrations**: a change to the table structure ships as an SQL file in `db/migrations/` (named by date). Run each new file once, after a backup:

```bash
cd /home/prafi/project/prafi-backend
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql
```

Each file runs in one transaction: it ends with `COMMIT`, or changes nothing if it fails.

Other database commands:

| command | does |
|---|---|
| `npm run db:seed` | Creates the superadmin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (safe to repeat) |
| `npm run db:sync` | Creates missing tables only (a fresh, empty database) |
| `npm run db:sync -- --force` | **Deletes all data** and recreates the tables. Never on the live server (refused when `NODE_ENV=production`) |

## 8. HTTPS certificates

Let's Encrypt certificates for the three domains are renewed automatically by certbot (`snap.certbot.renew.timer`, twice a day). The frontend holds port 80, so renewal briefly stops `prafi-frontend` and starts it again (renewal hooks in `/etc/letsencrypt/renewal-hooks/`, set up by `deploy/setup-cert-renewal.sh`).

```bash
sudo certbot certificates            # domains and expiry dates
sudo certbot renew --dry-run         # test renewal (the website is down for a few seconds)
```

nginx config: `/etc/nginx/sites-enabled/` (`default` = website, `api.transniaga` = API, `core.transniaga` = Webmin). After editing: `sudo nginx -t && sudo systemctl reload nginx`.

## 9. Running locally (development)

On your own computer with Node 22 and PostgreSQL:

```bash
# backend
cd prafi-backend
cp .env.example .env               # fill in DB_*, JWT_SECRET, SEED_ADMIN_*
npm install
npm run db:sync && npm run db:seed
npm run dev                        # http://localhost:4000 (restarts on save)

# frontend (second terminal)
cd prafi-frontend
cp .env.example .env.local         # API_URL=http://localhost:4000
npm install
npm run dev                        # http://localhost:3000
```

| command | backend | frontend |
|---|---|---|
| `npm run dev` | development server, restarts on save | development server, hot reload |
| `npm run build` | compiles `src/` into `dist/` | production build into `.next/` |
| `npm start` | runs `dist/` | runs the build on port 80 |
| `npm run typecheck` / `npm run lint` | type check | lint |
| `npm run docs` | regenerates the public API docs | |

## 10. Troubleshooting

| problem | check / fix |
|---|---|
| Website shows 502 Bad Gateway | The frontend is down: `systemctl status prafi-frontend`, then `journalctl -u prafi-frontend -n 50` |
| Website loads but data doesn't (empty lists, errors) | The backend is down or failing: `curl https://api.transniaga.manokwarikab.go.id/api/health`, then `journalctl -u prafi-backend -n 50` |
| A service keeps restarting (`code=exited`) | Read the log. Common causes: a wrong Node version (Next.js 16 on Node 18), a missing `.env` setting (`Missing required environment variable`), a build that wasn't run (`dist/` or `.next/` missing) |
| Backend log: database connection error | `systemctl status postgresql`; check `DB_*` in `.env` |
| Backend log: `column ... does not exist` | A migration wasn't run (section 7) |
| Emails don't arrive | Backend log shows the mail error; check `SMTP_*` (Gmail app password still valid?) |
| Public pages show old data | They are cached up to 60 s; check `REVALIDATE_SECRET` is the same in both `.env` files |
| Disk full | `df -h`; old logs: `sudo journalctl --vacuum-time=14d` |
| HTTPS certificate expired | `sudo certbot renew` and check its output |

## 11. Things to improve

- **Set `NODE_ENV=production`** in the backend `.env` (then restart): error responses still include internal details.
- **Automatic daily backups** of the database and `images/`, copied off the server.
- **Use a separate database user** for the app instead of the `postgres` superuser.
- **Limit Webmin** (ports 10000 and 20000 are open to the internet): allow only known IPs, or close them and use `core.transniaga…` only.
- **Put the backend `deploy/` folder in git**, so the service and nginx files aren't lost with the server.
