# Trans Niaga Server Guide

How the Trans Niaga (UMKM Prafi) server is set up and how to run, update and look after it. Written for whoever takes over the server.

> This guide is kept in two files that must stay in step: `docs/SERVER-GUIDE.md` (English) and `docs/SERVER-GUIDE.id.md` (Bahasa Indonesia). The page has an **ID / EN** switch and a **light / dark** theme switch; both choices are remembered in the browser.

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
| `/home/prafi/project/prafi-maintenance` | Maintenance page shown during updates (see *Updating the apps → Maintenance page*). Local git only |

Inside **prafi-backend** (every folder is explained in section 12):

| path | what |
|---|---|
| `src/` | Source code: `routes/` (URLs), `controllers/` (input checks), `services/` (logic), `models/` (database tables) |
| `dist/` | Compiled JavaScript that the service runs (made by `npm run build`; never edit) |
| `images/` | **Uploaded photos** (products, logos, profile photos, category images). Back it up together with the database |
| `db/migrations/` | SQL files that change the database structure, run once each in date order |
| `postman/` | Postman collection; source of the public API docs |
| `documentation/` | Generated public API docs (`npm run docs`) |
| `docs/SERVER-GUIDE.md`, `docs/SERVER-GUIDE.id.md` | This guide, in English and Bahasa Indonesia |
| `deploy/` | systemd unit, nginx config and setup scripts. **Only on the server, not in git yet** |
| `.env` | Backend settings and secrets |

Inside **prafi-frontend** (every folder is explained in section 13):

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
| `prafi-maintenance` | maintenance page; **instead of** `prafi-frontend` during updates (normally stopped) | 80 |
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

**The short way:** `bash ~/deploy.sh` does the steps below for both apps: database backup, new migrations, backend build, frontend build, restart. The restart needs the sudo password, so run it in SSH or the Webmin terminal. The manual steps:

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

### Maintenance page

While an update is running you can show visitors a notice instead of a half-updated site. It is a separate small app, `/home/prafi/project/prafi-maintenance` (service **`prafi-maintenance`**), that takes port 80 in place of the website. The two services can't run together: starting one stops the other.

```bash
sudo systemctl start prafi-maintenance   # maintenance page ON (the website stops)
# ... git pull, migration, npm run build, restart prafi-backend ...
sudo systemctl start prafi-frontend      # website back ON (the maintenance page stops)
```

- The page is in Bahasa Indonesia and English (it follows the visitor's browser; **ID / EN** switch on the page) and opens the real site by itself once it is back.
- Every address answers `503`, so search engines don't index it as the site; `/api/…` gets a JSON `MAINTENANCE` error.
- Optional estimated finish time, extra message and contact: edit `prafi-maintenance/maintenance.json` (no restart needed), e.g. `"until": "2026-10-12T15:00:00+07:00"`.
- It is never started at boot: after a reboot the real website comes up.
- Installed once with `sudo bash /home/prafi/project/prafi-maintenance/deploy/setup.sh`. Details: that folder's `README.md`.

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
| `FRONTEND_URL` | The website's address; used in email links (password reset, Disnakertrans activation) and for the pictures in this guide |
| `CORS_ORIGIN` | Other sites allowed to call the API from a browser (comma separated). The website itself doesn't need it |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Outgoing email (Gmail; `SMTP_PASS` is a Gmail *app password*). Without `SMTP_HOST`, emails are only printed in the log |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | The superadmin account made by `npm run db:seed` |
| `REVALIDATE_SECRET`, `FRONTEND_REVALIDATE_URL` | Lets the backend refresh the website's cached public pages right after a change; the same secret is in the frontend `.env` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile **secret** key: the backend confirms the review form's "not a robot" check with it. Empty = the check is skipped (warning at startup). Keep it secret; the matching *site* key is in the frontend `.env` |
| `LOG_RETENTION_DAYS` | Days of API logs to keep (default 30) |
| `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_EMAIL_TO` | Weekly backup (section 7): folder (default `~/backups/prafi`), how many runs to keep (8), and who gets the email (default: the SMTP account; `off` = none) |
| `DISK_ALERT_PERCENT`, `DISK_ALERT_EMAIL_TO` | Server monitor (section 14): an email is sent when the disk is this full (percent, default 90; 0 = no alert), to this address (default: the SMTP account; `off` = nobody) |
| `DB_LOGGING` | `true` prints every SQL query (debugging only) |

**Frontend** `/home/prafi/project/prafi-frontend/.env`:

| setting | meaning |
|---|---|
| `API_URL` | Backend address the website forwards to |
| `SITE_URL` | The website's own address (product links in WhatsApp messages). Default `https://transniaga.manokwarikab.go.id` |
| `NEXT_PUBLIC_ADMIN_WHATSAPP`, `NEXT_PUBLIC_ADMIN_EMAIL` | Contact shown in *Panduan → Hubungi Administrator* |
| `REVALIDATE_SECRET` | Same value as in the backend `.env` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile **site** key (public) for the review form's "not a robot" check |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console verification code (optional) |

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
| `otps`, `revoked_tokens` | Email codes and links (OTP, Disnakertrans activation, password reset), stored as hashes; logged-out tokens |
| `api_logs` | The Log API records |

Open the database console (the password is read from `.env`, so it is never typed or shown):

```bash
cd /home/prafi/project/prafi-backend
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" psql -h localhost -U postgres -d prafi_db
```

Inside: `\dt` lists tables, `\d products` shows a table, `\q` quits. Only read (`SELECT`) here unless you know exactly what a change does; the apps keep the data consistent.

**Automatic weekly backup.** Every **Sunday at 00:00 WIB** the backend makes a backup by itself (no cron needed):

| file | what |
|---|---|
| `prafi_db_<date>_<time>.sql.gz` | The whole database (`pg_dump`, compressed) |
| `prafi_images_<date>_<time>.tar.gz` | Every uploaded photo (`images/`). The database only holds their file names, so both files belong together |

- They are saved in **`/home/prafi/backups/prafi/`**, readable only by `prafi`. The newest **8** runs are kept; older ones are deleted automatically.
- The same files are **emailed as attachments** to the site's own Gmail account (`SMTP_USER` in `.env`), subject *Backup mingguan Trans Niaga*. That is the copy kept **off the server**: if the server is lost, the backups are still in that mailbox. Gmail takes 25 MB per email, so a backup that doesn't fit is sent as **several emails** (*bagian 1 dari 3*…): a file over the limit is cut into numbered parts (`….tar.gz.part01`, `.part02`, …). To rebuild it, download every part into one folder and run the `cat` line given in the email, e.g. `cat prafi_images_<date>.tar.gz.part* > prafi_images_<date>.tar.gz`. The copies on the server are always whole.
- The log shows each run: `journalctl -u prafi-backend | grep backup`.
- Run one now (e.g. before a risky change): `npm run backup`; without the email: `npm run backup -- --no-email`.

> The email settings can't upload to **Google Drive**: a Gmail app password only works for mail. The emailed copy sits in the same Google account's storage. Real Drive uploads would need a Google Cloud service account or OAuth login.

Settings (optional, backend `.env`): `BACKUP_DIR` (folder, default `~/backups/prafi`), `BACKUP_KEEP` (runs to keep, default 8), `BACKUP_EMAIL_TO` (another address, or `off` for no email), `BACKUP_EMAIL_MAX_MB` (file data per email, default 17; attachments grow by a third in an email, which keeps it under Gmail's 25 MB).

**Manual backup** (plain SQL, e.g. right before a migration):

```bash
cd /home/prafi/project/prafi-backend
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" pg_dump -h localhost -U postgres prafi_db > ~/backup_prafi_db_$(date +%F).sql
```

**Restore** a backup (replaces all current data: stop the backend first). From a weekly backup:

```bash
sudo systemctl stop prafi-backend
cd /home/prafi/project/prafi-backend
export PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)"
dropdb -h localhost -U postgres prafi_db
createdb -h localhost -U postgres prafi_db
gunzip -c ~/backups/prafi/prafi_db_YYYY-MM-DD_HHMM.sql.gz | psql -h localhost -U postgres -d prafi_db
tar -xzf ~/backups/prafi/prafi_images_YYYY-MM-DD_HHMM.tar.gz -C /home/prafi/project/prafi-backend
sudo systemctl start prafi-backend
```

Use the database and images files **from the same run**. From an emailed backup, first copy the two attachments to the server (Webmin File Manager → *Upload*, or `scp`). A plain `.sql` backup restores with `psql -h localhost -U postgres -d prafi_db -f <file>.sql` instead of the `gunzip` line.

**Migrations**: a change to the table structure ships as an SQL file in `db/migrations/` (named by date). Run each new file once, after a backup (section 12 lists the files and explains how to write one):

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
| `npm run images:cleanup -- --dry-run` | Lists unused uploaded images (section below) without deleting anything |
| `npm run images:cleanup` | Deletes them now, instead of waiting for the night |

**Unused images are cleaned up every night.** A form uploads its photo as soon as it is picked and only links it on *Simpan*; not saving deletes the upload again from the browser, but that can fail (tab closed offline, a crash). Every night at **00:00 WIB** (the server's clock; 02:00 WIT) the backend deletes what is left: image rows that no account photo, UMKM logo, product or category uses, with their files, and files in `images/` that have no image row. Only things **older than 24 hours** are touched, so a form being filled in is never affected. It runs inside the backend service (no cron needed) and logs one line, e.g. `[images] nightly cleanup: deleted 1 unused image(s) (ids 35) and 0 stray file(s), 1.3 MB freed` (`journalctl -u prafi-backend | grep images`). Code: `src/services/imageCleanup.service.ts`.

> If a new table ever gets an image column, add it to the list in `imageCleanup.service.ts` (`ORPHAN_WHERE`), or the cleanup would treat those images as unused.

## 8. HTTPS certificates

Let's Encrypt certificates for the three domains are renewed automatically by certbot (`snap.certbot.renew.timer`, twice a day). The frontend holds port 80, so renewal briefly stops `prafi-frontend` and starts it again (renewal hooks in `/etc/letsencrypt/renewal-hooks/`, set up by `deploy/setup-cert-renewal.sh`).

```bash
sudo certbot certificates            # domains and expiry dates
sudo certbot renew --dry-run         # test renewal (the website is down for a few seconds)
```

A **new domain** needs its own certificate. certbot's standalone mode needs port 80, so stop the frontend for the moment it takes:

```bash
sudo systemctl stop prafi-frontend
sudo certbot certonly --standalone -d new.transniaga.manokwarikab.go.id
sudo systemctl start prafi-frontend
```

Then point an nginx site at it (section 9).

## 9. nginx (HTTPS proxy)

nginx receives every HTTPS visit (port **443**), decrypts it with the certificate, and passes it to the right app by domain name (table in section 1). It does not serve any files itself, and it does **not** use port 80: plain HTTP goes straight to the frontend.

### Files

| path | what |
|---|---|
| `/etc/nginx/nginx.conf` | Main settings (workers, gzip, TLS versions, log paths). Rarely changed |
| `/etc/nginx/sites-available/` | One file per site: `default` (website), `api.transniaga` (API), `core.transniaga` (Webmin). The `.bak` files and `core.transniaga.manokwarikab.go.id` are old copies, not in use |
| `/etc/nginx/sites-enabled/` | **Links** to the sites that are switched on. nginx only loads what is linked here |
| `/etc/letsencrypt/live/<domain>/` | The certificates each site points to (managed by certbot) |
| `/var/log/nginx/access.log`, `error.log` | Every request / nginx errors. Rotated daily, older ones end in `.1`, `.2.gz`… |
| `prafi-frontend/deploy/nginx-default`, `nginx-core.transniaga`, `prafi-backend/deploy/nginx/api.transniaga` | Copies of the site files, kept with the projects. Update them when you change the live files |

### The three sites

| site file | domain | sends to | notable settings |
|---|---|---|---|
| `default` | `transniaga.manokwarikab.go.id` | `127.0.0.1:80` (frontend) | `client_max_body_size 10M` (largest request, e.g. a photo upload through the website) |
| `api.transniaga` | `api.transniaga.manokwarikab.go.id` | `127.0.0.1:4000` (backend) | `client_max_body_size 20M`; `proxy_read_timeout 3600s` so live connections (Socket.IO) stay open |
| `core.transniaga` | `core.transniaga.manokwarikab.go.id` | `127.0.0.1:10000` (Webmin) | `proxy_ssl_verify off` (Webmin's own certificate is self-signed); `proxy_buffering off` |

Every site passes the visitor's details to the app (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`; the API log shows real visitor IPs because of these) and the `Upgrade` / `Connection` headers that WebSockets need. Keep these lines when editing.

### Changing a site

Always test before reloading: a broken file can take **all three** sites down.

```bash
sudo cp /etc/nginx/sites-available/default ~/nginx-default.bak     # 1. back up
sudo nano /etc/nginx/sites-available/default                       # 2. edit (or Webmin File Manager)
sudo nginx -t                                                      # 3. must say "syntax is ok" and "test is successful"
sudo systemctl reload nginx                                        # 4. apply, without dropping visitors
```

If `nginx -t` fails, nothing has changed yet: fix the line it names, or put the backup back (`sudo cp ~/nginx-default.bak /etc/nginx/sites-available/default`). Use `reload`, not `restart`: a reload keeps the old settings running if the new ones are wrong.

Lines ending in `# managed by Certbot` are the certificate settings: leave them as they are.

### Common changes

**Upload size.** A photo upload passes three limits: nginx (`client_max_body_size`, 10M website / 20M API), then the backend's own limit of **5 MB per image** (`MAX_IMAGE_SIZE` in `src/config/upload.ts`). The smallest one wins. To allow bigger photos, raise the backend limit (and rebuild), and keep both nginx limits above it.

**Switch a site off / on.** Remove or re-create its link, then test and reload:

```bash
sudo rm /etc/nginx/sites-enabled/core.transniaga                                              # off
sudo ln -s /etc/nginx/sites-available/core.transniaga /etc/nginx/sites-enabled/core.transniaga  # on
sudo nginx -t && sudo systemctl reload nginx
```

**Add a domain** (e.g. a new subdomain for another app):

1. Point the domain's DNS (A record) to `156.67.104.230`.
2. Get its certificate (section 8).
3. Copy an existing site file as a start, e.g. `sudo cp /etc/nginx/sites-available/api.transniaga /etc/nginx/sites-available/new.transniaga`, and change `server_name`, the `proxy_pass` port and the two `ssl_certificate` paths.
4. Link it into `sites-enabled`, then `sudo nginx -t && sudo systemctl reload nginx`.

### Checking and logs

```bash
systemctl status nginx
sudo nginx -T | less                        # the full configuration nginx is really using
sudo tail -f /var/log/nginx/error.log       # errors live (Ctrl+C to quit)
sudo tail -f /var/log/nginx/access.log      # every request
```

**502 Bad Gateway** comes from nginx: the app behind it isn't answering. Check that app's service (section 4), not nginx.

Good to know: the frontend (not nginx) holds port 80, so the frontend itself sends `http://transniaga.manokwarikab.go.id/...` on to `https://` (a 308 redirect, in `prafi-frontend/src/middleware.ts`). Other host names on port 80 are not redirected: `http://api.transniaga…` is answered by the frontend through the website's `/api` proxy, and `http://localhost` / `http://127.0.0.1` stay plain (the backend uses them to refresh cached pages).

## 10. Webmin (server panel)

Webmin is a web panel for the server: look at the database, manage files and open a terminal from the browser, without an SSH program.

| what | value |
|---|---|
| Address | `https://core.transniaga.manokwarikab.go.id` (Webmin 2.670) |
| Login | A Linux account of this server that has Webmin access (e.g. `prafi`); the same password as SSH |
| Menu | Left sidebar, grouped (*System*, *Servers*, *Tools*…). Type a module name in the sidebar search to find it quickly |

> Webmin works with **full administrator (root) rights**. A wrong click can delete files or data of the whole server. Read before confirming, back up before changing (section 7), and log out (top-left menu → *Logout*) when done.

### PostgreSQL (database)

Where PostgreSQL keeps its files on the server:

| path | what |
|---|---|
| `/etc/postgresql/16/main/postgresql.conf` | Main settings (port, memory, listen address) |
| `/etc/postgresql/16/main/pg_hba.conf` | Who may connect from where, and how (password rules) |
| `/var/lib/postgresql/16/main/` | The data files of every database. **Never edit or delete anything here by hand**: use the database tools (and `pg_dump` for backups) |
| `/var/log/postgresql/postgresql-16-main.log` | PostgreSQL's own log (start, stop, errors, failed logins) |

Open **Servers → PostgreSQL Database Server**:

1. The page lists the databases. The app's database is **`prafi_db`**; `postgres`, `template0` and `template1` belong to PostgreSQL itself, leave them alone.
2. If Webmin asks for a database login, use user `postgres` and the `DB_PASSWORD` from the backend `.env` (set it once under *Module Config*).
3. Click **`prafi_db`** to see its tables (section 7 says what each holds). Click a table, then **View Data** to browse its rows.
4. **Execute SQL** runs a query, e.g. `SELECT name, price FROM products ORDER BY created_at DESC LIMIT 20;`. Use it for reading (`SELECT`). Don't change rows here: the apps keep related data together (an approval with each product, image files with image rows…), and a manual change can break that.
5. **Backup Database** makes a dump file, the same as the `pg_dump` command in section 7. Choose a file path such as `/home/prafi/backup_prafi_db_YYYY-MM-DD.sql`.
6. **Restore Database** replaces the data with a backup. Stop the backend first (`sudo systemctl stop prafi-backend`) and only do this to recover from a problem.
7. To change a PostgreSQL setting, edit the files above (e.g. with the File Manager), then restart PostgreSQL from this page (or `sudo systemctl restart postgresql`). The backend reconnects by itself; restart it if it doesn't.

### File Manager

Open **Tools → File Manager** to browse, edit, upload and download files.

| folder | what you find there |
|---|---|
| `/home/prafi/project/prafi-backend` | Backend: `.env`, `src/`, `images/` (uploaded photos), `db/migrations/`, `docs/SERVER-GUIDE.md` |
| `/home/prafi/project/prafi-frontend` | Frontend: `.env`, `src/`, `public/` |
| `/home/prafi/` | Home folder, a good place for backups |
| `/etc/nginx/sites-enabled/` | nginx (HTTPS) config of the three domains |
| `/etc/systemd/system/` | `prafi-backend.service`, `prafi-frontend.service` |
| `/etc/postgresql/16/main/`, `/var/log/postgresql/` | PostgreSQL config and log (above) |

Common tasks:

- **Edit a file** (e.g. `.env`): select it, then *Edit*; save. Then do what section 6 says: restart the backend, or rebuild and restart the frontend. Changing `.env` this way is fine; don't edit source code here (changes go through git, section 5).
- **Download** a backup or a log: select it, then *Download*.
- **Upload** a file: open the target folder, then *Upload*.
- **Hidden files** (names starting with a dot, like `.env`): turn on showing hidden files in the File Manager's settings if they don't appear.

> Files created or uploaded through Webmin belong to **root**. The apps run as user `prafi` and can't change root's files: e.g. product photos in `images/` or a new `.env` would fail. After uploading or creating anything inside `/home/prafi/project`, set its owner to `prafi` (select it → *Change ownership* → user and group `prafi`), or in the terminal: `sudo chown -R prafi:prafi /home/prafi/project`.

### Terminal

Open **Tools → Terminal** for a shell on the server, the same as SSH. Every command in this guide works here.

- The terminal starts as **root**. Switch to the app user first, so `node` / `npm` (Node 22 from nvm) and git work and new files get the right owner:

```bash
su - prafi
cd /home/prafi/project/prafi-backend
```

- As `prafi`, commands that change the system still need `sudo` (e.g. `sudo systemctl restart prafi-backend`), with the `prafi` password.
- `exit` goes back to root, or closes the terminal.
- A long build (`npm run build`) keeps running only while the tab is open: keep it open until it finishes. For something that must survive closing the browser, use SSH.
- **Tools → Command Shell** runs a single command and shows its output, handy for a quick check like `systemctl status prafi-backend`.

## 11. Running locally (development)

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

## 12. Backend (Express): structure and daily work

The backend is the API at `https://api.transniaga.manokwarikab.go.id`: an **Express 5** app written in **TypeScript**, with **Sequelize** for the PostgreSQL database, **Socket.IO** for live notifications and **nodemailer** for email. Folder: `/home/prafi/project/prafi-backend`.

### How a request is handled

Every request passes the same chain. Knowing it tells you which file to open:

| step | folder | what happens there |
|---|---|---|
| 1. Route | `src/routes/` | Matches the URL and method, and names who may call it (`authenticate`, `authorize(...roles)`) |
| 2. Middleware | `src/middlewares/` | Checks the login token and role, logs the request, handles photo uploads |
| 3. Controller | `src/controllers/` | Reads and validates the input (400 with field messages in Bahasa Indonesia when wrong), calls the service, sends the JSON answer |
| 4. Service | `src/services/` | The actual work and rules: reads and writes the database, sends emails and notifications |
| 5. Model | `src/models/` | One file per database table (columns, relations) |
| 6. Error handler | `src/middlewares/errorHandler.ts` | Turns any error into the standard answer `{ "success": false, "error": { "code", "message", "details" } }` |

### Folders and files

| path | purpose |
|---|---|
| `src/server.ts` | Start-up: connects to the database, opens port 4000 and Socket.IO, starts the scheduled jobs |
| `src/app.ts` | The Express app: security headers, CORS, `/images` (uploaded photos), `/docs` (public API docs), `/api` routes, error handler |
| `src/config/` | `env.ts` reads `.env` (a missing required setting stops the start), `database.ts` the database connection, `upload.ts` photo limits (5 MB, allowed types) and the `images/` folder |
| `src/constants/` | Fixed lists: `roles.ts` (the four roles and **who may do what**), `notifications.ts`, `realtime.ts` (live event names), `products.ts` (rules for the *recommended* label) |
| `src/routes/` | One file per area: `auth`, `user`, `approval`, `product`, `productCategory`, `review`, `tenant`, `image`, `notification`, `stats`, `apiLog`, `landing` (public pages), `serverDocs` (this guide), `serverMonitor` (Monitor Server). `index.ts` joins them under `/api` |
| `src/controllers/` | Input checks and answers, one file per area |
| `src/services/` | Logic, one file per area, plus `mail.service.ts`, `emailVerification.service.ts` (OTP, Disnakertrans activation), `passwordReset.service.ts`, `backup.service.ts`, `imageCleanup.service.ts`, `apiLog.service.ts`, `serverMonitor.service.ts`, `loginGuard.service.ts` |
| `src/models/` | Database tables as code; `index.ts` links them together |
| `src/middlewares/` | `auth.ts` (token and role), `requestLogger.ts` (console line and Log API), `upload.ts`, `errorHandler.ts`, `landingRefresh.ts` (tells the website to refresh its cached pages) |
| `src/mail/templates.ts` | Every email (Bahasa Indonesia): subject, HTML and plain text |
| `src/realtime/socket.ts` | Socket.IO: live notifications, ending sessions |
| `src/utils/` | Small helpers: `jwt.ts`, `markdown.ts`, `turnstile.ts` ("not a robot" check), `clientIp.ts`, `readablePassword.ts`, `revalidateLanding.ts` |
| `src/scripts/` | Commands run by hand (`seed.ts`, `sync.ts`, `backup.ts`, `cleanupImages.ts`) and the API docs generator (`docs.ts`, `docs.id.md`, `docs.flows.ts`) |
| `src/types/` | TypeScript declarations (what `req.user` holds) |
| `db/migrations/` | SQL files that change the table structure (below) |
| `dist/` | The compiled program the service runs. Made by `npm run build`; never edit it |
| `images/` | Uploaded photos. Not in git; part of every backup |
| `postman/` | Postman collection and environment: the source of the public API docs |
| `documentation/` | The generated public API docs (`/docs`). Made by `npm run docs`; never edit it |
| `docs/` | This guide: `SERVER-GUIDE.md` (English), `SERVER-GUIDE.id.md` (Bahasa Indonesia), and `server-page/` (the page that shows it) |
| `deploy/` | The systemd service file, nginx site file and setup scripts. Only on the server, not in git |
| `.env`, `.env.example` | Settings and secrets (section 6); the example lists every name without the secrets |
| `package.json`, `tsconfig.json` | Dependencies and commands; TypeScript settings |

### Commands

Run them in `/home/prafi/project/prafi-backend` as user `prafi`.

| command | does |
|---|---|
| `npm run build` | Compiles `src/` into `dist/` (about 10 seconds). Needed after every code change |
| `npm run typecheck` | Checks the code for type errors without building |
| `npm run dev` | Development only: runs straight from `src/` and restarts on save |
| `npm start` | Runs `dist/server.js` (what the service does) |
| `npm run docs` | Rebuilds the public API docs from the Postman collection |
| `npm run db:seed` | Creates the superadmin account (safe to repeat) |
| `npm run db:sync` | Creates missing tables (a new, empty database only) |
| `npm run backup` | Makes a backup now (section 7) |
| `npm run images:cleanup` | Deletes unused uploaded photos now (section 7) |

### Build and restart

The service runs the compiled files, so a change in `src/` does nothing until it is built **and** the service is restarted:

```bash
cd /home/prafi/project/prafi-backend
npm install            # only when package.json changed
npm run build          # stops with an error message if the code is wrong; the running version is untouched
sudo systemctl restart prafi-backend
journalctl -u prafi-backend -n 20     # should end with "Server running on ..."
```

The helper script `bash ~/deploy.sh` does the whole update in one go: database backup, new migrations, backend build, frontend build, then the restart (it prints the restart command when it can't ask for the sudo password).

### Database migrations

A **migration** is an SQL file that changes the table structure (a new column, a new table, a different type). The live database is never changed by `db:sync`: every structure change is a file in `db/migrations/`, run once.

Files so far, in the order they were run:

| file | change |
|---|---|
| `20261008_price_instagram_reviews.sql` | Product price and *recommended* flag, Instagram link, product reviews |
| `20261008_2_image_uploader.sql` | Who uploaded each image |
| `20261008_3_tenant_links.sql` | Google Bisnis and Shopee links; Instagram optional |
| `20261008_4_api_log_summary.sql`, `20261008_5_api_log_auth_email.sql` | More detail in the Log API |
| `20261009_product_categories.sql` | Product categories with an image |
| `20261010_review_moderation.sql` | Reporting and hiding reviews |
| `20261012_google_business_link_text.sql` | Longer Google Bisnis link |
| `20261013_tenant_links_optional.sql` | Every UMKM link optional |

**Running a migration** (always back up first, and run it **before** restarting the backend with the new code):

```bash
cd /home/prafi/project/prafi-backend
npm run backup -- --no-email
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql
```

**Writing a new one:**

1. Name it `YYYYMMDD_what_it_does.sql` so the files sort by date.
2. Start with a comment: the date, what changes and why, and the command to run it.
3. Wrap several statements in `BEGIN;` … `COMMIT;`, so a failure changes nothing.
4. Change the matching model in `src/models/` in the same commit, so code and database stay equal.
5. Try it on a **copy** of the database before the live one:

```bash
export PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)"
createdb -h localhost -U postgres prafi_test
pg_dump -h localhost -U postgres prafi_db | psql -q -h localhost -U postgres -d prafi_test
psql -h localhost -U postgres -d prafi_test -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql
dropdb -h localhost -U postgres prafi_test        # when done
```

6. Add a line for it to `~/deploy.sh` (the `migrate` lines), with a query that tells whether it was already applied.

> There is no table that records which migrations ran. If you are unsure, look at the structure: `\d tenants` in the database console shows the columns a migration should have added or changed.

### Jobs that run by themselves

They run inside the backend service; there is no cron to look after. All times are the server's clock (WIB).

| job | when | code |
|---|---|---|
| Delete unused uploaded photos | every night, 00:00 | `src/services/imageCleanup.service.ts` |
| Backup of database and photos, emailed | every Sunday, 00:00 | `src/services/backup.service.ts` |
| Delete old Log API rows (older than `LOG_RETENTION_DAYS`) | daily | `src/services/apiLog.service.ts` |
| Disk check, with an email when it is almost full | every 10 minutes | `src/services/serverMonitor.service.ts` |

### Adding or changing an endpoint

1. Table change needed? Write the migration and update the model (above).
2. Put the rule in the **service**, the input checks in the **controller**, and the URL with its allowed roles in the **route** (roles come from `src/constants/roles.ts`).
3. Messages for users are in Bahasa Indonesia; code comments in English.
4. Add the request to the Postman collection (`postman/Prafi-API.postman_collection.json`), its Indonesian text to `src/scripts/docs.id.md`, and run `npm run docs`.
5. `npm run typecheck`, try it on a copy of the database, then build and restart.

## 13. Frontend (Next.js): structure and daily work

The frontend is the website at `https://transniaga.manokwarikab.go.id`: a **Next.js 15** app (App Router) with **React 19** and **Tailwind CSS 4**. Folder: `/home/prafi/project/prafi-frontend`. It holds no data of its own: everything comes from the backend API.

### How a page gets its data

| kind of page | where it is drawn | how it gets data |
|---|---|---|
| Public pages (Beranda, Produk, product, UMKM, Panduan) | On the server, so search engines and link previews get the full page | `src/lib/server-api.ts` calls the backend; answers are cached for 60 seconds and refreshed at once when the backend reports a change (`POST /internal/revalidate`) |
| Dashboards, login, account pages | In the visitor's browser | `src/lib/api.ts` calls `/api/...` with the login token kept in the browser |

The browser always calls `/api`, `/images` and `/socket.io` on the website's own domain; `next.config.ts` forwards them to the backend (`API_URL`).

### Folders and files

| path | purpose |
|---|---|
| `src/app/` | **Pages.** One folder per address: `src/app/tenant/produk/page.tsx` is `/tenant/produk`. `layout.tsx` wraps the pages below it; `loading.tsx` is the grey placeholder shown while a page loads |
| `src/app/(public)/` | Public pages with the site header and footer: `page.tsx` (Beranda), `produk/`, `umkm/`, `panduan/`. The brackets group pages without adding to the address |
| `src/app/admin/`, `disnakertrans/`, `superadmin/`, `tenant/` | One dashboard per role. Each `layout.tsx` holds that role's **sidebar menu** |
| `src/app/login/`, `register/`, `verifikasi/`, `aktivasi/`, `lupa-password/`, `reset-password/`, `akun/` | Sign-in, sign-up, email OTP, Disnakertrans activation, password pages |
| `src/app/robots.ts`, `sitemap.ts`, `manifest.ts`, `opengraph-image.tsx` | Search engine files and the default sharing picture |
| `src/app/internal/revalidate/` | The address the backend calls to refresh cached pages |
| `src/app/globals.css` | Colours and base styles of the whole site |
| `src/components/site/` | Public pages: header, footer, carousel, product cards, reviews |
| `src/components/dashboard/` | Dashboards: sidebar shell, tables, forms, charts, notifications |
| `src/components/auth/` | Login frame, registration steps, OTP form |
| `src/components/shadcn/` | Basic building blocks (button, input, dialog, table…). **Written by hand**: don't run the shadcn command, it would overwrite them |
| `src/components/Icons.tsx` | Every icon (inline SVG) |
| `src/lib/api.ts` | **Every API call** from the browser, one function per endpoint |
| `src/lib/server-api.ts` | API calls for the public pages (server side, cached) |
| `src/lib/auth.tsx` | The login session in the browser |
| `src/lib/guides.tsx` | The Panduan content (section 15) |
| `src/lib/seo.tsx` | Titles, descriptions and structured data for search engines |
| `src/lib/format.ts`, `types.ts`, `adCalculator.ts`, … | Formatting (Rupiah, dates), data types, the profit calculator's formulas |
| `src/middleware.ts` | Sends plain `http://` visits to `https://` |
| `next.config.ts` | The `/api` forwarding and the "don't index" headers of private pages |
| `public/` | Files served as they are: logo, icons, guide screenshots in `public/panduan/` |
| `.next/` | The built site the service runs. Made by `npm run build`; never edit it |
| `docs/PANDUAN-PENGGUNA.md` | The user guide as a document |
| `deploy/` | systemd service file, nginx site files, setup script |
| `.env`, `.env.example` | Settings (section 6) |

### Commands

Run them in `/home/prafi/project/prafi-frontend` as user `prafi`.

| command | does |
|---|---|
| `npm run build` | Builds the site into `.next/` (1 to 2 minutes). Needed after every change, including `.env` |
| `npm run lint` | Checks the code for mistakes (missing import, unused variable) |
| `npm run dev` | Development only: `http://localhost:3000` with live reload |
| `npm start` | Runs the built site on port 80 (what the service does) |

### Build and restart

```bash
cd /home/prafi/project/prafi-frontend
npm install            # only when package.json changed
npm run build          # the live site keeps running the old build meanwhile; an error here changes nothing
sudo systemctl restart prafi-frontend
```

Things to remember:

- **Settings are read at build time.** After changing the frontend `.env`, build and restart, not only restart.
- **The frontend has no migrations.** Database changes belong to the backend (section 12). If an update changes both, deploy the backend first.
- **Stay on Next.js 15** (section 3), and never run `npm audit fix --force` here.
- For a visible update, switch on the **maintenance page** first (section 5) and switch the website back on afterwards.

### Common changes

| I want to… | where |
|---|---|
| Change a text on a page | The page's file in `src/app/…/page.tsx`, or the component it uses in `src/components/` |
| Add a menu item to a dashboard | The `NAV` list in that role's `src/app/<role>/layout.tsx`, plus a new folder with a `page.tsx` |
| Call a new API endpoint | Add a function to `src/lib/api.ts` (and its type to `src/lib/types.ts`) |
| Change a colour or the font | `src/app/globals.css` |
| Change the help pages | `src/lib/guides.tsx` (section 15) |
| Change the contact shown in Panduan | `NEXT_PUBLIC_ADMIN_WHATSAPP`, `NEXT_PUBLIC_ADMIN_EMAIL` in `.env`, then build |
| Change what search engines see | `src/lib/seo.tsx` and the page's `metadata`; the README has an *SEO* section |

## 14. System features

What the system does, by who uses it. The pictures are screenshots of the website with sample data (`prafi-frontend/public/panduan/fitur-*.jpg`); click one to see it full size. Step-by-step instructions for users are in the website's **Panduan** (`/panduan`) and in `prafi-frontend/docs/PANDUAN-PENGGUNA.md`.

### Roles

| role | how the account is made | what it does |
|---|---|---|
| Visitor | no account | Browses products and UMKM, writes reviews |
| Tenant (seller / UMKM) | signs up at `/register`, confirms the email with an OTP | Shop profile, products, reviews of own products, profit calculator |
| Admin | signs up at `/register/admin` (OTP), then **activated by Disnakertrans** | Approves products, manages categories, activates sellers, decides on reported reviews |
| Disnakertrans | created by the superadmin; gets a temporary password and an activation link by email | Activates admins; also everything an admin does for products, categories and reviews |
| Superadmin | made on the server (`npm run db:seed`) | Creates Disnakertrans accounts, reads everything, Log API, this guide |

### Visitors (no login)

- **Beranda**: a carousel of the product categories with the products of the category on show, recommended products, and the list of UMKM. A product is *recommended* (thumbs-up) with at least 3 reviews averaging 4.8 stars or more.

![Beranda: menu, category carousel and products](panduan/fitur-beranda.jpg)

- **Search**: the magnifier in the header searches products and shops.

![Search box](panduan/fitur-cari.jpg)

- **Produk**: every approved product, **best rating first**, with a switch to *newest first*, a search box and a category filter.

![Produk page sorted by rating](panduan/fitur-produk-urut.jpg)

- **Product page**: photo, price, description, the seller, and **contact buttons** (WhatsApp with a ready message, Shopee, Instagram, Google Bisnis, Facebook, location) for the links the seller filled in.

![Product page](panduan/fitur-produk-detail.jpg)

- **Reviews without login**: 1 to 5 stars and a text of at least 3 words, after a "not a robot" check (Cloudflare Turnstile). One review per product per day from the same browser and network.

![Reviews and the review form on a product page](panduan/fitur-ulasan.jpg)

- **UMKM page**: the shop's profile, address, opening hours, contact buttons, rating and all its products.

![A UMKM page](panduan/fitur-umkm.jpg)

- **Panduan**: help topics with step-by-step screenshots, terms, privacy policy and the administrator's contact.

### Sellers (tenant)

- **Sign-up in steps** with email OTP (15 minutes); the account is active right away.

![Seller sign-up: account details](panduan/fitur-daftar.jpg)

![Email OTP](panduan/fitur-daftar-otp.jpg)

- **Dashboard**: the number of products by status (active, waiting, rejected, taken down), with shortcuts to edit the profile and add a product.

![Seller dashboard](panduan/fitur-tenant-dashboard.jpg)

- **Profil UMKM**: logo, name, area, description, address, opening hours; WhatsApp number and every link are optional. Products can be added once the profile and the account photo are complete.

![Profil UMKM form](panduan/fitur-profil-umkm.jpg)

- **Products**: add with photo, price, category, description; a new or changed product waits for approval (*Menunggu Konfirmasi*). Rejected products show the reason and can be fixed and sent again.

![Adding a product](panduan/fitur-tambah-produk.jpg)

![Product status list](panduan/fitur-produk-saya.jpg)

![A rejected product with its reason](panduan/fitur-produk-ditolak.jpg)

- **Ulasan Produk**: every review of the seller's products, updated live; a fake or abusive review can be **reported** once, with a reason.

![Ulasan Produk: reviews and the report button](panduan/fitur-tenant-ulasan.jpg)

- **Kalkulator Profit & Iklan**: margin, break-even ROAS, highest safe ad cost per sale, and net profit per unit and per month. Nothing is saved.

![Kalkulator Profit & Iklan](panduan/fitur-tenant-kalkulator.jpg)

- **Notifications** (live, with an unread badge), **Bantuan & Ketentuan**, and **Pengaturan Akun** (name, phone, photo, password).

![Notifications](panduan/fitur-notifikasi.jpg)

![Account settings](panduan/fitur-pengaturan-akun.jpg)

### Admin

- **Dashboard**: sellers and products by status for a chosen period, and the products waiting for confirmation.

![Admin dashboard](panduan/fitur-admin-dashboard.jpg)

- **Konfirmasi Produk**: approve, reject (with a reason) or take down products. The seller is notified each time.

![Konfirmasi Produk](panduan/fitur-admin-konfirmasi.jpg)

![Product detail before deciding](panduan/fitur-admin-konfirmasi-detail.jpg)

- **Kategori Produk**: add, rename, delete; each category needs an image (shown in the Beranda carousel).

![Kategori Produk](panduan/fitur-admin-kategori.jpg)

- **Manajemen UMKM**: activate or deactivate seller accounts, and read their shop profiles.

![Manajemen UMKM](panduan/fitur-admin-umkm.jpg)

- **Laporan Ulasan**: reviews reported by sellers; **hide** (no longer shown or counted in the rating), **keep**, or show a hidden one again.

![Laporan Ulasan](panduan/fitur-admin-ulasan.jpg)

- **Manajemen Produk** (all products by status and category), **Notifikasi**, **Pengaturan**.

### Disnakertrans

- **Account activation by email**: the superadmin doesn't choose a password. The new officer gets a temporary password and a button; on the activation page they type it and set their own password.

![Activation page of a Disnakertrans account](panduan/fitur-aktivasi-akun.jpg)

- **Aktivasi Admin**: activate or deactivate admin accounts. A newly activated admin gets an email.

![Aktivasi Admin](panduan/fitur-disnakertrans-admin.jpg)

- **Konfirmasi Produk**, **Laporan Ulasan**, **Kategori Produk**: the same as an admin. **Data Produk** and **Data UMKM** to read.

### Superadmin

- **Dashboard**: totals of every kind of account and of products by status.

![Superadmin dashboard](panduan/fitur-superadmin-dashboard.jpg)

- **Akun Disnakertrans**: create accounts (name, phone, email; no password) and resend the activation email.

![Adding a Disnakertrans account](panduan/superadmin-1-tambah.jpg)

- **Semua Pengguna**, **Data Produk**, **Data UMKM**, **Kategori Produk**: read-only.

![Semua Pengguna](panduan/fitur-superadmin-pengguna.jpg)

- **Log API**: every create, update and delete by signed-in users and every login attempt, with the result, a chart of requests per day and the most frequent errors. Passwords and tokens are never logged.

![Log API](panduan/fitur-superadmin-log.jpg)

- **Monitor Server**: CPU, RAM and disk of the server live (a new reading every 3 seconds while the page is open, with a chart of the last 5 minutes), whether the backend, website, maintenance page, PostgreSQL and nginx are running, and how much the database, photos and backups take. Nothing is stored.

![Monitor Server](panduan/fitur-superadmin-monitor.jpg)

- **Panduan Server**: this guide, in English and Bahasa Indonesia, light or dark.

### Behind the scenes

| feature | what it does | where |
|---|---|---|
| Email | Sign-up OTP, Disnakertrans activation, password reset, "your admin account is active", weekly backup. All in Bahasa Indonesia | `src/mail/templates.ts`, `SMTP_*` in the backend `.env` |
| Live notifications | Notifications, review lists and the unread badge update without reloading (Socket.IO) | `src/realtime/socket.ts` |
| Login protection | 5 wrong passwords for one account from one network, or 20 from one network across accounts, in 15 minutes: that network must wait (429). Counted in the backend's memory, so a restart clears it | `src/services/loginGuard.service.ts` |
| Sessions | Login lasts 1 hour; logout, deactivation or a password reset ends the session at once | `src/middlewares/auth.ts` |
| Photo uploads | A photo uploads when picked and is attached on *Simpan*; unused ones are deleted every night | sections 7 and 12 |
| Review protection | "Not a robot" check, one review per product per day, at most 5 reviews in 10 minutes per network, reporting and hiding. Visitors' IP addresses are stored only as a hash | `src/services/review.service.ts` |
| Weekly backup | Database and photos, kept on the server and emailed | section 7 |
| Disk alert | Every 10 minutes the backend checks the disk; at `DISK_ALERT_PERCENT` (90) or more it emails the site's mailbox what takes space and what can be cleared, at most once a day | `src/services/serverMonitor.service.ts` |
| Search engines (SEO) | Titles, descriptions, sitemap, structured data, `http` to `https` | frontend README, *SEO* |
| Maintenance page | Shown instead of the website during updates, in two languages | section 5 |
| Public API docs | `/docs` on the API domain, in English and Bahasa Indonesia, with flow charts | `npm run docs` |

## 15. Updating the Panduan (help pages)

The **Panduan** is the website's help: `/panduan` for everyone (header and footer link) and **Bantuan & Ketentuan** in the seller (tenant) dashboard. Both show the same list of topics; each topic opens to show its text and step-by-step screenshots. All of it lives in the **frontend** code; the backend is not involved.

### Where the files are

All paths are inside `/home/prafi/project/prafi-frontend`.

| file | what it does |
|---|---|
| `src/lib/guides.tsx` | **The content.** The `GUIDES` list: every topic with its title, icon, who sees it, and its text. This is the file you edit |
| `public/panduan/*.jpg` | The screenshots used by the steps (1024×640 JPG) |
| `src/components/GuideSteps.tsx` | `Steps` and `Step`: the numbered steps, each with an optional screenshot (click = full size) |
| `src/components/GuideList.tsx` | Draws the topic list (each topic is an expandable box) |
| `src/app/(public)/panduan/page.tsx` | The public page `/panduan`: shows topics whose `audience` has `"public"` |
| `src/app/tenant/bantuan/page.tsx` | The seller page `/tenant/bantuan`: shows topics whose `audience` has `"tenant"` |
| `docs/PANDUAN-PENGGUNA.md` | The same guide as a document (for printing / sharing). Not shown on the website: update it by hand when a topic changes |
| `prafi-backend/docs/SERVER-GUIDE.md` and `.id.md`, section 14 | This guide's feature list has its own screenshots in the same folder (`fitur-*.jpg`): add a line and a picture there when a new feature arrives |

### How a topic is written

Each entry in `GUIDES` (in `src/lib/guides.tsx`) has these fields:

| field | meaning |
|---|---|
| `id` | Short name with dashes, unique. Also the topic's link: `/panduan#<id>` (e.g. the login page links to `/panduan#ketentuan`) |
| `title` | Topic title (Bahasa Indonesia) |
| `summary` | One line under the title |
| `icon` | An icon from `src/components/Icons.tsx` (e.g. `IconPlus`, `IconStore`); import it at the top of the file |
| `color` | Icon colour, e.g. `"#0e3c69"` (navy) or `"#ea7b25"` (orange) |
| `audience` | Where it shows: `"public"` = `/panduan`, `"tenant"` = seller dashboard. `"admin"` is accepted but no page shows it yet |
| `body` | The content: steps (`<Steps>` / `<Step>`), or ordinary text (`<p>`, `<ul><li>`) |

Inside the text, `<b>…</b>` makes words bold (use it for button and menu names, as the other topics do) and `<Link href="/register">…</Link>` links to a page of the website. The topics show in the order of the list.

A step with a screenshot:

```tsx
<Step image="produk-2-foto" alt="Kotak unggah foto produk">
  Klik kotak <b>UNGGAH FOTO PRODUK</b> lalu <b>PILIH FILE</b>.
</Step>
```

`image` is the file name in `public/panduan/` **without** `.jpg`; `alt` describes the picture for screen readers. Leave out `image` for a step without a picture.

### Example 1: add a new topic

A new topic *Cara Memberi Ulasan* for visitors and sellers. It uses the thumbs-up icon `IconThumb` (any icon exported by `src/components/Icons.tsx` works): add it to the `import { … } from "@/components/Icons"` list at the top of `src/lib/guides.tsx`. Then add an entry to `GUIDES`, between two existing `{ … },` entries, at the place it should appear:

```tsx
  {
    id: "beri-ulasan",
    title: "Cara Memberi Ulasan",
    summary: "Memberi bintang dan ulasan pada produk",
    icon: IconThumb,
    color: "#ea7b25",
    audience: ["public", "tenant"],
    body: (
      <Steps>
        <Step image="ulasan-1-form" alt="Form ulasan di halaman produk">
          Buka halaman produk, gulir ke bagian <b>ULASAN PEMBELI</b>, lalu di <b>Tulis Ulasan</b> pilih jumlah bintang (1 – 5).
        </Step>
        <Step>
          Isi nama dan ulasan Anda, lalu klik <b>Kirim Ulasan</b>. Tidak perlu login.
        </Step>
      </Steps>
    ),
  },
```

Put the screenshot at `public/panduan/ulasan-1-form.jpg` (section below). The topic is then at `/panduan#beri-ulasan`.

### Example 2: change an existing topic

Search `src/lib/guides.tsx` for the topic's `id` (e.g. `id: "tambah-produk"`) and edit its text, or add a `<Step>` between two existing ones. For example, to tell sellers about photo quality in *Panduan Menambahkan Produk*, add after the photo step:

```tsx
        <Step>
          Gunakan foto yang terang dan jelas, dengan latar polos. Lihat juga topik <b>Ketentuan Foto / Deskripsi</b>.
        </Step>
```

Step numbers are added automatically. For a topic without steps (like *Kebijakan Privasi*), add or edit `<li>…</li>` lines in its `<ul>`.

### Screenshots

- Take the screenshot from the real website (with sample data, not real customers), and outline the part the step talks about in **red**, as in the existing pictures.
- Save it as **JPG, 1024×640** pixels (the page reserves that shape), under about 200 KB.
- Name it `<topic>-<number>-<what>.jpg` (e.g. `ulasan-1-form.jpg`) and put it in `public/panduan/`. Pictures used only by this server guide are named `fitur-<what>.jpg`.
- To replace a picture, overwrite the file with the same name: no code change needed.

### Publishing the change

The Panduan is part of the frontend build, so a change shows only after a rebuild. Work in git as for any change (section 5):

```bash
cd /home/prafi/project/prafi-frontend
npm run lint                  # catches a missing import or a typo in the tags
npm run build                 # a mistake in guides.tsx stops here; the live site is untouched
sudo systemctl restart prafi-frontend
```

Then check `/panduan` (and **Bantuan & Ketentuan** as a seller). Common mistakes: a tag opened but not closed (`<b>` without `</b>`), a missing `,` after `},`, an icon used but not imported, or an `image` name that doesn't match the file (the step then shows a broken picture).

## 16. Troubleshooting

| problem | check / fix |
|---|---|
| Website shows 502 Bad Gateway | The frontend is down: `systemctl status prafi-frontend`, then `journalctl -u prafi-frontend -n 50` |
| Website loads but data doesn't (empty lists, errors) | The backend is down or failing: `curl https://api.transniaga.manokwarikab.go.id/api/health`, then `journalctl -u prafi-backend -n 50` |
| A service keeps restarting (`code=exited`) | Read the log. Common causes: a wrong Node version (Next.js 16 on Node 18), a missing `.env` setting (`Missing required environment variable`), a build that wasn't run (`dist/` or `.next/` missing) |
| Backend log: database connection error | `systemctl status postgresql`; check `DB_*` in `.env` |
| Backend log: `column ... does not exist` | A migration wasn't run (section 7) |
| Someone can't log in: "Terlalu banyak percobaan login yang gagal" | Too many wrong passwords from their network. It ends by itself after 15 minutes; *Lupa Password* works meanwhile. To clear every wait at once: `sudo systemctl restart prafi-backend` |
| Emails don't arrive | Backend log shows the mail error; check `SMTP_*` (Gmail app password still valid?) |
| Public pages show old data | They are cached up to 60 s; check `REVALIDATE_SECRET` is the same in both `.env` files |
| Disk full, or the email *Peringatan: disk server … terisi …%* arrived | See what takes space in the dashboard's **Monitor Server**, or `df -h`. Clear old logs (`sudo journalctl --vacuum-time=14d`), old manual backups in the home folder, or keep fewer weekly backups (`BACKUP_KEEP`). Size of each top folder: `sudo du -xh / --max-depth=1` |
| HTTPS certificate expired | `sudo certbot renew` and check its output |

## 17. Things to improve

- **Use a separate database user** for the app instead of the `postgres` superuser.
- **Limit Webmin** (ports 10000 and 20000 are open to the internet): allow only known IPs, or close them and use `core.transniaga…` only.
- **Put the backend `deploy/` folder in git**, so the service and nginx files aren't lost with the server.
- **Turn off old TLS versions**: `ssl_protocols` in `/etc/nginx/nginx.conf` still allows TLS 1.0 and 1.1; `TLSv1.2 TLSv1.3` is enough for every current browser.
