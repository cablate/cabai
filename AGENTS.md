# Contributor and AI guide

This file is stable navigation and safety guidance for contributors and coding agents. Start with README.md; do not infer maturity from file names or historical completion checkboxes.

## Project principles

Read PRINCIPLES.md before planning changes. This Git repository is the shared product source for self-hosts and the maintainer deployment, not a recurring export. Operator data and configuration stay separate; do not create a permanent private product fork.

## Read only what the task needs

- First run: docs/development/GETTING-STARTED.md and CONFIGURATION.md.
- Architecture and owners: docs/architecture/MODULE-MAP.md and DATA-AND-FLOWS.md, then actual source/callers.
- Tests: package.json, docs/development/DEVELOPMENT-AND-TESTING.md, and src/test/setup.ts.
- Work priorities: docs/planning/ROADMAP.md. Public API contracts: docs/contracts/ and docs/openapi/agent-v1.json.
- Deployment: docs/operations/DEPLOYMENT-AND-OPERATIONS.md. Incidents: TROUBLESHOOTING.md.
- Security: SECURITY.md. Contribution workflow: CONTRIBUTING.md.

## Before changing anything

Confirm checkout, branch, dirty state and intended outcome. Preserve unrelated work. Build hypotheses from inspected source; label assumptions and unverified runtime behavior. Locate the existing owner/helper before adding abstractions. Prefer one small behavior-preserving change over a new framework.

## Non-negotiable safety boundaries

- Never read, print, commit or copy real credentials, customer data, paid content or backups into tests/docs.
- Use disposable local database/storage and neutral fixtures. A URL containing `_test` alone is not proof it is disposable. Integration prepare and cleanup can delete data.
- Payment grants require verified provider evidence. Client redirects are not payment evidence. Private assets fail closed; database roles/scopes are authoritative.
- Do not use the original maintainer's services or silently enable external integrations. Each self-host owns its OAuth, payment, mail and storage configuration.
- Production writes, real payments, notifications, migrations on non-disposable DBs, publishing, force pushes and destructive cleanup require explicit owner authorization.
- Applied SQL migrations are immutable. Use a new forward migration, never rewrite production history.

## Finish a change

Run focused regression first, then applicable type/static/integration/build checks. Verify the behavior, not only command completion. Report local/runtime/production evidence separately. Update the existing owning document; do not create a competing master plan. Keep changes and next action reviewable.
