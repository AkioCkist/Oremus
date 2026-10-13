#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set production secrets/origin first." >&2
  exit 1
fi

if grep -Eq '^JWT_(ACCESS|REFRESH)_SECRET=dev-' .env; then
  echo "Refusing to deploy with the example JWT secrets in .env." >&2
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

firewall_backend="none"
if command -v ufw >/dev/null 2>&1; then
  firewall_backend="ufw"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall_backend="firewalld"
fi
if [ "$firewall_backend" != "none" ] && [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo so the script can allow TCP port $web_port in the host firewall." >&2
  exit 1
fi

docker compose config --quiet
docker compose up --build -d
docker compose exec -T web node dist/scripts/migrate.js

attempt=0
until docker compose exec -T web wget -q -O /dev/null http://127.0.0.1:3000/health; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Web health check did not pass after 60 seconds." >&2
    docker compose logs --tail=100 web >&2
    exit 1
  fi
  sleep 2
done

if [ "$firewall_backend" = "ufw" ]; then
  ufw allow "$web_port/tcp"
elif [ "$firewall_backend" = "firewalld" ]; then
  firewall-cmd --permanent --add-port="$web_port/tcp"
  firewall-cmd --reload
else
  echo "No active UFW or firewalld installation detected; no host firewall rule was needed or changed."
fi

docker compose ps
echo "Oremus is healthy and listening on TCP port $web_port."
echo "If your VPS provider has a cloud firewall/security group, allow this port there too."
