#!/usr/bin/env node
// Retired operator-specific mutator. Deliberately performs no I/O beyond this notice.
console.error("Retired: this legacy operator script is not a supported public workflow. Use the scoped Admin UI/Agent API for content, or scripts/run-migrations.mjs for reviewed PostgreSQL migrations. Read AGENTS.md and docs/development/GETTING-STARTED.md first. No changes were made.");
process.exitCode = 2;
