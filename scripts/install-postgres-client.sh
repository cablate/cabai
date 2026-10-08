#!/usr/bin/env bash
set -euo pipefail

if command -v pg_dump >/dev/null 2>&1 && pg_dump --version | grep -qE ' 18\.'; then
  pg_dump --version
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg

. /etc/os-release
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor --yes -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg

echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list

apt-get update
apt-get install -y --no-install-recommends postgresql-client-18
apt-get clean
rm -rf /var/lib/apt/lists/*

pg_dump --version
