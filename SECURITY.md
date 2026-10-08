# Security Policy

CabAI handles authentication, paid orders, entitlements, private course assets, provider
callbacks, and operator credentials. Please report suspected vulnerabilities privately.

## Supported versions

Before the first public release, only the latest commit on the default branch is supported.
After versioned releases begin, this table will be replaced by the explicit supported-release
matrix in the release notes.

| Version | Supported |
|---|---|
| Default branch before v0.1 | Yes |
| Older commits and unmaintained forks | No |

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a suspected vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/cablate/cabai/security/advisories/new).
This channel is enabled for this repository. If GitHub is temporarily unavailable, wait until
private reporting is restored rather than posting vulnerability details publicly.
Self-hosted installation incidents should go to that installation's operator.

Please include:

- the affected revision, route, component, or deployment profile;
- reproduction steps or a minimal proof of concept;
- expected and observed behavior;
- likely impact and prerequisites;
- whether production data or credentials may have been exposed;
- a safe way to contact you for follow-up.

Do not include real credentials, payment details, access tokens, private course content, or
customer data. Redact them and use a minimal test fixture.

The maintainer will assess severity and reproduction steps, then coordinate the fix and disclosure with the reporter. There is no fixed response-time commitment yet; please allow time for a fix before public disclosure.

## Security boundaries for contributors

- Payment callbacks must preserve signature validation, amount/currency checks, provider-safe
  responses, idempotency, concurrency safety, and reconciliation.
- Entitlements and private assets fail closed; redirects and client state are never payment or
  authorization evidence.
- Secrets belong in environment/secret-manager configuration and must never be committed,
  logged, placed in URLs, or copied into fixtures.
- New OAuth providers require an explicit account-linking security decision before enabling
  them; the current Google-only assumptions are not portable by default.
- Migration SQL that may have been applied is immutable. Corrections use new forward-only
  migrations and must include upgrade/rollback evidence.

For deployment, backups and recovery, see [Deployment and Operations](docs/operations/DEPLOYMENT-AND-OPERATIONS.md).
