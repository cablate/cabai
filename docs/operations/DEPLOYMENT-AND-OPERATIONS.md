# Deployment and Operations

This guide is for a self-host operator using their own database, secrets, domain and integrations. Start with the neutral demo in [Getting Started](../development/GETTING-STARTED.md). The development Compose file runs only PostgreSQL; the reference production profile is `compose.production.example.yml`.

This guide takes you from a fresh server to a running site, then covers HTTPS, backups and upgrades. If someone else operates the target host, agree on the deployment and recovery plan with them before making changes.

## Choose the smallest profile

The reference profile runs one application, PostgreSQL and a one-shot migration container. Local storage persists in the application data volume. Backups, scheduled jobs and external providers are disabled by default. It binds HTTP to loopback; an operator-managed HTTPS reverse proxy is needed for public use. Start with this single-instance setup; multiple replicas need a separate storage and scheduler design.

Read the actual Compose file and [Configuration](../development/CONFIGURATION.md) before changing it. Use a dedicated Compose project name and isolated volumes when evaluating the example; do not reuse a production project's name for tests.

## Host and operator prerequisites

The reference production target is **one Linux host with Docker Engine and Compose v2**, persistent disk, and an operator-managed reverse proxy on that same host. Windows/Docker Desktop is useful for evaluation, not evidence of an unattended Linux production installation. Building images downloads npm packages and base images; budget host memory/disk and hosting/domain costs yourself. No maintained public image registry is supplied before the first release.

Before starting, your AI should establish: a new empty installation or existing data; exact source revision; a unique Compose project name; available loopback port; disk/backup destination; domain ownership and HTTPS ingress; who holds secrets and performs restores. An existing database, occupied port or existing Compose project is a reason to inspect, not to erase or replace it. Commands below use `cabai-evaluation`; choose one persistent project name for a real installation and retain it across upgrades.

## Prepare configuration privately

Create an ignored environment file for Compose interpolation and runtime configuration. Values without defaults are declared with `:?` in the reference Compose file; the others below select its defaults:

- `POSTGRES_DB`, `POSTGRES_USER`, and a generated `POSTGRES_PASSWORD`;
- `DATABASE_URL` pointing to the Compose service hostname `postgres` and the matching database/user;
- independently generated `AUTH_SECRET` and `CRON_SECRET`;
- `AUTH_URL`, `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` set to the same application origin;
- `CABAI_IMAGE`, `CABAI_PORT` and `CABAI_ENV_FILE` for your image, loopback port and environment file.

For a **new isolated installation**, this Linux-shell snippet creates `.env.production` with independent random secrets, without printing them or overwriting an existing file. It requires Node.js on the operator workstation; Node is not otherwise required on the Docker host. Run from the repository root. The loopback origin is deliberately not a public deployment:

```sh
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const secret = () => randomBytes(32).toString('hex');
const password = secret();
const origin = 'http://localhost:3000';
const values = {
  POSTGRES_DB: 'cabai', POSTGRES_USER: 'cabai', POSTGRES_PASSWORD: password,
  DATABASE_URL: `postgresql://cabai:${password}@postgres:5432/cabai`,
  AUTH_SECRET: secret(), CRON_SECRET: secret(),
  AUTH_URL: origin, NEXTAUTH_URL: origin, NEXT_PUBLIC_APP_URL: origin,
  CABAI_IMAGE: 'cabai:local', CABAI_PORT: '3000', CABAI_ENV_FILE: '.env.production',
  STORAGE_PROVIDER: 'local', BACKUP_PROVIDER: 'disabled',
  SCHEDULED_TASKS_ENABLED: 'false', SCHEDULER_MODE: 'disabled',
  DB_BACKUP_WRITES_ENABLED: 'false', AUTH_GOOGLE_ID: '', AUTH_GOOGLE_SECRET: '',
};
writeFileSync('.env.production', Object.entries(values)
  .map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
  { flag: 'wx', mode: 0o600 });
console.log('Created .env.production; secrets were not printed.');
NODE
```

Keep this file private and outside shared AI transcripts. On another OS, use a private editor/secret manager with equivalent random values and restrictive file permissions; POSIX mode is not a Windows ACL. Do not rerun the generator to rotate a live database password: PostgreSQL initializes credentials only when its volume is empty. Copy the private file securely if building on a workstation and running on another host.

Before public use, edit all three origins to your exact `https://` origin (no path/query), add your own contact/legal identity and public branding from [Configuration](../development/CONFIGURATION.md), and configure Google separately. `DATABASE_URL` uses `postgres`, not `localhost`, inside Compose. Generated hexadecimal passwords need no URI escaping; manually supplied passwords with reserved characters must be percent-encoded in the URL. Compose shell environment values can override the file: clear stale exported deployment variables before validating.

Do not paste a resolved `docker compose config` into an issue: it can print secrets. Use `config --quiet` for validation. `NEXT_PUBLIC_*` values consumed by client code can be baked into a build; changing runtime environment variables alone is not a promise that client-side identity/assets will change. Never put secrets in public-prefixed variables or image build arguments.

Member sign-in requires your own Google OAuth client and callback configuration. Use the separate bootstrap flow to create the first administrator, then test ordinary member login. Enable payments, mail, Discord, R2 or monitoring only after independently validating the relevant provider contract and your configuration.

## Build and start your isolated installation

For an evaluation environment, after verifying its project name, origin, database and volumes:

```sh
docker compose --env-file .env.production -p cabai-evaluation -f compose.production.example.yml config --quiet
docker compose --env-file .env.production -p cabai-evaluation -f compose.production.example.yml build
docker compose --env-file .env.production -p cabai-evaluation -f compose.production.example.yml up -d --wait
```

These commands use the `.env.production` file created above. For an existing site, follow the upgrade section instead.

Check the installation before inviting members:

1. The migration container exits successfully, and startup verifies the current schema.
2. Public `/api/health` succeeds; authenticated core readiness succeeds inside the app container via `node scripts/container-health.mjs --readiness`.
3. Your expected public content loads, unauthenticated private/admin routes deny access, and authenticated member/admin flows work with your own accounts.
4. Local media survives app recreation, and private media denies expired/revoked/unauthorized reads.
5. A separate restore target can recover both database state and media, not only a successful dump command.

The image runs as a non-root user. The reference app uses a read-only root filesystem, writable data volume and bounded temporary/cache/log filesystems. Verify these properties on your host; do not disable them just to hide an unexplained write failure. Logs in the reference temporary filesystem are not durable; choose a secret-scrubbed collection/retention strategy if you need incident history.

## HTTPS ingress and member login

Keep the app's published port on `127.0.0.1`; PostgreSQL has no published host port. One documented option is host-installed Caddy with this site block, replacing the example domain and port with your own:

```caddyfile
learn.example.com {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up -CF-Connecting-IP
    }
}
```

Client-IP rate limiting defaults to a shared `unknown` bucket: arbitrary forwarding headers are not trusted. For this direct-client → host-Caddy → loopback-app topology only, set `TRUSTED_CLIENT_IP_HEADER=x-real-ip` in your private runtime environment **after** applying the overwrite above and verifying the app cannot be reached except through that proxy. Keep it unset for an unverified ingress. If another proxy/CDN precedes Caddy, `{remote_host}` is that proxy, not the end user; do not copy this opt-in as a multi-proxy trust recipe. `cf-connecting-ip` is an alternative only with independently verified Cloudflare-only origin access and an ingress that prevents client header injection. Bearer-key limits remain keyed by the authenticated key, not this header. See [Caddy upstream-header behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers).

This is a **host-service** example: inside a separate proxy container, `127.0.0.1` points to that proxy, not the app. Do not expose the app on all interfaces to work around a topology mistake. The operator must install/configure the proxy, arrange DNS and firewall rules, and retain certificate storage. Caddy's public HTTPS requires a suitable domain, reachable challenge ports and persistent writable certificate storage; see its [reverse-proxy guide](https://caddyserver.com/docs/quick-starts/reverse-proxy) and [automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https). After configuration, check HTTPS from a browser outside the host.

The application uses Auth.js `trustHost: true`. Only the reviewed ingress should reach it; preserve the intended host and have the proxy set trustworthy forwarded protocol/host headers instead of accepting arbitrary client-supplied forwarding identity. A CDN or second proxy changes this trust boundary and needs its own review. Do not add wildcard origins or disable auth/CSRF checks to fix callback failures.

After aligning the application origins and proxy, use [Google member login](../development/CONFIGURATION.md#google-member-login) and then [First admin](../development/CONFIGURATION.md#first-admin). Bootstrap establishes only the first admin session; after removing its token, future login requires the configured Google account. Choose an email you control and can actually use with Google. Keep setup restricted to the operator until bootstrap is disabled.

Verify from an external browser: HTTPS without certificate warnings; correct canonical links; sign-in and sign-out using an ordinary member; anonymous private/admin denial; member access after a legitimate grant and denial after revocation; admin authoring. Do not submit credentials to the placeholder domain or treat `/api/auth/providers` as proof of successful OAuth. Public health proves only liveness; readiness and role checks are separate.

## Inspect, stop and restart without erasing data

Use the same environment file, project name and Compose file every time:

```sh
docker compose --env-file .env.production -p cabai-evaluation -f compose.production.example.yml ps -a
docker compose --env-file .env.production -p cabai-evaluation -f compose.production.example.yml exec -T app node scripts/container-health.mjs --readiness
docker compose --env-file .env.production -p cabai-evaluation -f compose.production.example.yml stop
docker compose --env-file .env.production -p cabai-evaluation -f compose.production.example.yml up -d --wait
```

Inspect `logs --tail 100 migrate app` locally when startup fails; redact secrets, email addresses, URLs containing tokens and customer content before sharing. Stop leaves named database/media volumes intact. `down` also preserves named volumes unless `--volumes` is added; **do not use `down --volumes`, volume prune or broad filesystem deletion as troubleshooting**. For permanent removal, first verify a paired backup and operator-approved retention/deletion decision for the exact project's volumes, private environment file, proxy configuration and certificates.

## Upgrade and rollback

Use an exact reviewed revision/image digest and retain the previous compatible image. Production uses committed forward migrations, never `db:push`, edited applied SQL or a manually repaired migration ledger.

- Reference Compose uses `MIGRATION_MODE=external`: its one-shot migration container owns changes, and app startup only asserts schema currency.
- Direct image startup defaults to `auto`, which runs the migration runner with its database advisory lock.
- There are no general down migrations. Rollback means a schema-compatible previous application plus a reviewed forward repair if needed; it does not undo data changes.

Before a persistent change, establish an independently verified backup, restore target and operator-approved recovery plan. Record the source revision, image digest, migration receipt and smoke results without credentials or customer data. Confirm the deployment window and recovery plan with the operator.

## Recovery and optional operations

Database dumps do not include local/R2 media bytes. Recover storage objects and their registry state together, then verify checksums and authorization. Restore drills must use a pre-created empty target distinct from the source; never clear production to make a drill pass.

### Local storage recovery: what must travel together

For the reference single-instance/local-storage profile, retain a consistent set of:

| Item | Why it is needed |
|---|---|
| PostgreSQL dump, including migration ledger and media registry | Object ownership/context, member access and application state are database records, not inferred from filenames. |
| Entire `LOCAL_STORAGE_PATH` tree, including each `.meta.json` sidecar | Object bytes alone are insufficient. The storage provider requires the sidecar's content type; a file-only restore is rejected. |
| Exact application commit/image and privately held configuration | Restore with a compatible schema/runtime. Keep secrets outside the backup report and public repository. |
| File inventory/checksums and snapshot time | Detect missing, mismatched or corrupted files before serving the restored site. |

Pause application writes, scheduled jobs and upload writers for the database/storage snapshot window, or use an operator-reviewed coordinated snapshot mechanism. Independently copying live files while the database changes is not a consistent recovery point. Keep backups access-controlled and separate from the source storage; a second directory on the same disk is not disaster recovery.

Restore the database into an empty isolated database and the whole storage tree into an empty isolated directory/volume. Point a separate application at both, restore runtime filesystem ownership, then compare the registry, migration ledger, checksums and content types. Run the application's migration check before exposing traffic. Rotating the local-storage signing secret invalidates old signed URLs; obtain new links through normal authorized application flows. Never change private registry contexts to public just to make restored files readable.

Finally check anonymous denial, entitled-member access, revoked-member denial and admin editing through the restored application. Use those role checks to decide whether the restored site is ready for a cutover. R2/object-version recovery, live cutover, large datasets and recovery-time targets need their own operator drill.

### Repeatable synthetic recovery check

With dependencies installed and a **local** Docker engine running:

```sh
docker pull postgres:18.0-alpine
npm run test:recovery
```

The explicit pull obtains the test image; the test itself never pulls. It ignores operator database/storage configuration and creates its own randomly named PostgreSQL container, loopback port, RAM-backed database and temporary media directories. It applies the real migrations, uploads two synthetic objects using the real storage provider, inserts their registry records, dumps/restores PostgreSQL into another empty database and copies the media snapshot into another directory. It compares registry/ledger data, checksums, MIME sidecars, readable bytes and private cache headers, checks secret rotation, and proves that DB-only and missing-sidecar restores are incomplete. Normal completion/failure stops its own container and removes its own temporary files; an abruptly killed process may require removing the container labeled `cabai.purpose=synthetic-recovery-test` after verifying ownership. Never use a broad Docker cleanup command.

This opt-in check is separate from `npm test`: it requires Docker, does not start the web application, does not test member authorization and is not the `db:restore:drill` backup-manifest CLI. Run it when changing storage layout, media schema, migration behavior or the local recovery procedure.

Jobs require an explicit owner and scheduler mode. Do not enable the same in-process schedule across replicas, use a GET cron when a route requires authenticated POST, or infer delivery from configuration presence. See [Troubleshooting](TROUBLESHOOTING.md), the actual job/provider code and [contracts](../contracts/) for the enabled capability.

The optional [Cloudflare maintenance worker](../../deploy/cloudflare/maintenance-worker/README.md) is a separate deployment, not required to try the demo. It has no approved production routes by default. Real payment tests, external notifications, permissions, production migrations and public deployment require the installation owner's current authorization.

Each operator must choose backup retention, recovery objectives, private incident contacts, monitoring and patch responsibility. Keep those responsibilities documented with your deployment settings.

### Inherited migration ledger compatibility

`drizzle/applied-migration-exceptions.json` retains exact historical hash/timestamp matches required to recognize existing installations. These are compatibility identifiers, not credentials, and do not authorize arbitrary ledger repair. The original private operational receipts are not distributed; this document explains the inherited allowlist rather than claiming a new hosted verification. Fresh installs use the committed SQL/journal; migration-audit tests exercise known and unknown variants. Never edit applied SQL, broaden an exception or rewrite a live ledger to silence a failed startup check. An unknown mismatch requires backup, diagnosis and explicit operator approval.
