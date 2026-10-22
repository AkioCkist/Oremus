#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set production secrets/origin first." >&2
  exit 1
fi

env_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 | tr -d '\r' | sed 's/^"//;s/"$//'
}

access_secret="$(env_value JWT_ACCESS_SECRET)"
refresh_secret="$(env_value JWT_REFRESH_SECRET)"
case "$access_secret:$refresh_secret" in
  :*|*:|dev-*|*:dev-*|replace-*|*:replace-*)
    echo "Refusing to deploy without two non-placeholder JWT secrets." >&2
    exit 1
    ;;
esac
if [ "$access_secret" = "$refresh_secret" ]; then
  echo "JWT access and refresh secrets must be different." >&2
  exit 1
fi

app_origin="$(env_value APP_ORIGIN)"
case "$app_origin" in
  https://*) ;;
  *)
    echo "APP_ORIGIN must be the public HTTPS origin before deployment." >&2
    exit 1
    ;;
esac
if printf '%s' "$app_origin" | grep -q ','; then
  echo "Use one canonical HTTPS APP_ORIGIN in production." >&2
  exit 1
fi

web_port="$(sed -n 's/^[[:space:]]*WEB_PORT[[:space:]]*=[[:space:]]*//p' .env | tail -n 1 | tr -d '\r')"
web_port="${web_port:-3000}"
case "$web_port" in
  *[!0-9]*|'')
    echo "WEB_PORT must be a number between 1 and 65535." >&2
    exit 1
    ;;
esac
if [ "$web_port" -lt 1 ] || [ "$web_port" -gt 65535 ]; then
  echo "WEB_PORT must be a number between 1 and 65535." >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  echo "Docker is not installed or is not on PATH." >&2
  exit 1
}
docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose v2 is required." >&2
  exit 1
}

compose() {
  docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"
}

compose config --quiet
compose build
compose run --rm --no-deps --user root --cap-add CHOWN web chown -R node:node /app/apps/web/uploads
compose up -d
compose exec -T web node dist/scripts/migrate.js

attempt=0
until compose exec -T web wget -q -O /dev/null http://127.0.0.1:3000/health; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Web health check did not pass after 60 seconds." >&2
    compose logs --tail=100 web >&2
    exit 1
  fi
  sleep 2
done

compose ps
echo "Oremus is healthy on loopback port $web_port."
echo "Terminate HTTPS in a reverse proxy on ports 80/443 and forward to 127.0.0.1:$web_port."
