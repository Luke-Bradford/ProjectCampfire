#!/usr/bin/env bash
# ProjectCampfire — dev startup script
# Run this from the project root: bash dev-start.sh

set -e

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

step() { echo -e "\n${BOLD}$1${RESET}"; }
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $1${RESET}"; }
fail() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

# ── 1. Check prerequisites ────────────────────────────────────────────────────
step "Checking prerequisites..."

command -v node  >/dev/null 2>&1 || fail "Node.js not found. Install from https://nodejs.org"
command -v pnpm  >/dev/null 2>&1 || fail "pnpm not found. Run: npm install -g pnpm"
command -v docker >/dev/null 2>&1 || fail "Docker not found. Install Docker Desktop."
docker info >/dev/null 2>&1      || fail "Docker is not running. Please start Docker Desktop first."

ok "Node $(node -v), pnpm $(pnpm -v), Docker ready"

# ── 2. Check .env ─────────────────────────────────────────────────────────────
step "Checking .env file..."

if [ ! -f ".env" ]; then
  warn ".env not found — copying from .env.example"
  cp .env.example .env
fi

if grep -q 'AUTH_SECRET=""' .env; then
  warn "AUTH_SECRET is empty — generating one now"
  SECRET=$(openssl rand -base64 32)
  sed -i "s|AUTH_SECRET=\"\"|AUTH_SECRET=\"$SECRET\"|" .env
  ok "AUTH_SECRET generated"
else
  ok ".env looks good"
fi

# ── 3. Install dependencies ───────────────────────────────────────────────────
step "Installing dependencies..."
pnpm install --frozen-lockfile
ok "Dependencies installed"

# ── 4. Start Docker services ──────────────────────────────────────────────────
step "Starting Docker services (Postgres, Redis, MinIO, Mailhog)..."
docker-compose up -d

# Wait for Postgres to be healthy
echo "Waiting for Postgres to be ready..."
for i in $(seq 1 20); do
  if docker-compose exec -T postgres pg_isready -U campfire >/dev/null 2>&1; then
    ok "Postgres ready"
    break
  fi
  if [ "$i" -eq 20 ]; then
    fail "Postgres did not become ready in time. Check: docker-compose logs postgres"
  fi
  sleep 1
done

# ── 5. Run migrations ─────────────────────────────────────────────────────────
step "Running database migrations..."
pnpm db:generate
pnpm db:migrate
ok "Migrations applied"

# ── 6. Seed database ──────────────────────────────────────────────────────────
step "Seeding database with test accounts..."
pnpm db:seed
ok "Seed complete"

# ── 7. Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Everything is ready!${RESET}"
echo ""
echo "  App:        http://localhost:3000"
echo "  Mailhog:    http://localhost:8025  (catches all dev emails)"
echo "  MinIO:      http://localhost:9001  (login: minioadmin / minioadmin)"
echo ""
echo "  Test accounts (password: password123):"
echo "    alice@campfire.local  @alice"
echo "    bob@campfire.local    @bob"
echo "    carol@campfire.local  @carol"
echo ""
echo -e "Now run: ${BOLD}pnpm dev${RESET}"
echo ""
