# Getting started: local neutral demo

Follow this guide to run CabAI on your computer and explore the sample course. You will start a local PostgreSQL database, load the sample content and open the site in your browser. Google login can be added afterward; the first administrator has a separate setup flow.

## 1. Prepare configuration before running commands

Requirements: Node.js `>=22.12 <25`, npm 10+, Docker Engine with Compose v2, and Git. These requirements come from `.node-version`, `.nvmrc`, `package.json` and `docker-compose.yml`.

If you do not yet have a checkout, start in a new directory:

```bash
git clone https://github.com/cablate/cabai.git
cd cabai
```

Run the remaining commands from that repository root. Check `node --version`, `npm --version` and `docker compose version`, and start your Docker engine before continuing. For a second installation, use a different Compose project name and free database/app ports; `cabai-dev` below identifies one persistent local installation, not a disposable command name.

For a new checkout, copy `.env.example` to `.env`. If `.env` already exists, edit it instead of overwriting it:

```bash
# macOS / Linux
if [ ! -e .env ]; then cp .env.example .env; else echo '.env already exists; keeping your configuration'; fi
```

```powershell
# PowerShell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env } else { Write-Host '.env already exists; keeping your configuration' }
```

Run this command twice to generate two different secrets. Put one in `AUTH_SECRET` and the other in `CRON_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The example database URL matches the local Compose defaults. Its known password is for disposable loopback-only development, never production. If port 5432 is occupied, set `POSTGRES_PORT` and change the port in `DATABASE_URL` together. If changing database/user/password, set the corresponding `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and update `DATABASE_URL` together. The database credentials are initialized only on a fresh volume; editing them does not change an existing database.

Keep `AUTH_URL`, `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` on the same local origin (`http://localhost:3000` by default). Set your own site/creator/contact identity before hosting. Leave Google, Kit, payment, Discord, R2 and Sentry credentials empty for the minimal profile. Keep:

```dotenv
STORAGE_PROVIDER=local
BACKUP_PROVIDER=disabled
SCHEDULER_MODE=disabled
DB_BACKUP_WRITES_ENABLED=false
```

Use development credentials here, separate from the accounts and data on your live site.

## 2. Start the database and sample site

Before running the migration and sample loader, check that `DATABASE_URL` points to the new local database. These commands change its schema and insert sample records, so keep it separate from real member data.

From the repository root:

```bash
npm ci
docker compose --project-name cabai-dev --env-file .env up -d --wait postgres
node --env-file=.env scripts/run-migrations.mjs
npm run doctor -- --json
npm run script:seed-demo
npm run dev
```

The Compose command starts PostgreSQL. `npm run dev` starts the application. The sample loader uses fixed example IDs, so repeating it updates the same sample records.

Open `http://localhost:3000`. Follow the demo course/product links and view a preview lesson. The seed receipt should report **2 chapters, 3 lessons, free_claim=enabled**. `/subscribe` should say subscriptions are disabled and should not ask for an email while Kit is unset. `doctor` should report a connected database and disabled optional capabilities. You can check login and member access after setting up authentication.

The sample course is licensed in `fixtures/demo-course/manifest.json`. Ordinary member login is needed to claim the course and track progress; you can try admin editing first through the separate bootstrap flow below.

## 3. Try admin editing, then enable member login

No Google account configuration is needed for the first admin bootstrap session. Follow [First admin](CONFIGURATION.md#first-admin): add a fresh `ADMIN_BOOTSTRAP_TOKEN` to your private `.env`, stop and restart `npm run dev`, then open `http://localhost:3000/setup/admin`. Enter the administrator email and token in the form, not in the URL. After reaching `/admin`, edit a sample lesson and reload it to check that changes persist. Once an administrator exists, bootstrap rejects further attempts even if the token remains configured, and the setup page shows that initialization is complete. You can continue using the site without a cleanup restart. Remove the unused token at your next configuration maintenance; before intentionally removing all administrators, remove it first to avoid reopening bootstrap. `ADMIN_BOOTSTRAP_EMAILS` is not the runtime selector; do not change roles directly in the database.

Bootstrap is not a reusable login method. To sign in again after that session ends, configure your own Google OAuth client with the exact origin and redirect URL described in [Google member login](CONFIGURATION.md#google-member-login). Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`; restart the app. Use the same email as bootstrap for future admin login, and a separate ordinary account to verify course claiming, progress and admin denial. This OAuth check is separate from a successful bootstrap.

## 4. Verify changes safely

```bash
npm run verify:static
npm run test:unit
npm run test:component
npm run test:contract
npm run test:reliability
```

Before `npm run verify` or integration/E2E tests, configure a **separate disposable test database** using [DEVELOPMENT-AND-TESTING](DEVELOPMENT-AND-TESTING.md). Use a loopback URL with a database name ending in `_test` and no query parameters; after verifying it is disposable, set `TEST_DATABASE_RESET_CONFIRM` to that exact database name. The guard is not permission to target an important database. Test preparation synchronizes schema and may delete data. Never point test variables at the demo or production database. `verify` includes integration and build, but not Playwright E2E.

## Stop, persist, troubleshoot

```bash
docker compose --project-name cabai-dev --env-file .env stop postgres
# Restart the same database without removing its volume:
docker compose --project-name cabai-dev --env-file .env up -d --wait postgres
```

Stop the dev server with Ctrl+C. The Compose volume persists database data; `data/storage` persists local media separately. Do not use `down --volumes` unless you deliberately intend to erase this project's disposable database. Back up database and media before an upgrade; they are not interchangeable.

- Database/startup failure: [TROUBLESHOOTING](../operations/TROUBLESHOOTING.md).
- Configuration/provider selectors: [CONFIGURATION](CONFIGURATION.md).
- Tests and database isolation: [DEVELOPMENT-AND-TESTING](DEVELOPMENT-AND-TESTING.md).
- Containers, deployment, migration and recovery: [DEPLOYMENT-AND-OPERATIONS](../operations/DEPLOYMENT-AND-OPERATIONS.md).
- Contribution boundaries: [CONTRIBUTING](../../CONTRIBUTING.md).

Validation receipt: on 2026-10-08, Node 22.23.2/npm 10.9.8 on Windows with Docker PostgreSQL 18.0 completed isolated migration, doctor and demo seed. Chrome verified the home page, demo product, anonymous preview lesson, and `/subscribe` disabled with no email input. This is local evidence, not a Linux/container, login, restore or production acceptance claim. Update this guide when setup commands or selectors change.
