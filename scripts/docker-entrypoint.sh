#!/usr/bin/env sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL="$(bun --eval '
const value = process.env.DATABASE_URL;
if (!value) process.exit(0);

const url = new URL(value);
if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  url.hostname = "host.docker.internal";
}

process.stdout.write(url.toString());
')"
  export DATABASE_URL
fi

exec "$@"
