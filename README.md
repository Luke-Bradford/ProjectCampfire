# ProjectCampfire

> Private social planning for gaming friend groups.

ProjectCampfire is a self-hostable platform that helps friend groups decide what to play, know who is free, see who already owns a game, and keep session planning plus conversation in one place — without scattering everything across Discord, WhatsApp, and Steam chat.

---

## What it does

- **Session planning** — create events, run time and game polls, collect RSVPs, send reminders
- **Availability** — members share when they're free; the app shows group overlap
- **Game ownership** — see who owns what before you vote on a game
- **Activity feed** — posts, images, link embeds, reactions, and reposts scoped to your friend graph and groups
- **Private by design** — no public spaces, no strangers; everything is invite-only

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend + API | Next.js 15 (App Router, TypeScript) |
| API | tRPC v11 |
| Database | PostgreSQL 16 |
| ORM | Drizzle ORM |
| Auth | Lucia Auth |
| Jobs | BullMQ + Redis |
| Storage | MinIO (S3-compatible) |
| Email | Nodemailer + SMTP relay |
| Proxy | Caddy |
| UI | shadcn/ui + Tailwind CSS |

---

## Running locally

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/projectcampfire.git
cd projectcampfire

# Copy environment variables
cp .env.example .env

# Start all services
docker compose up -d

# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Seed development data (optional)
pnpm db:seed

# Start the development server
pnpm dev
```

The app will be available at `http://localhost:3000`.
Mailhog (dev email catcher) runs at `http://localhost:8025`.
Drizzle Studio (database GUI) runs via `pnpm db:studio`.

### Production (self-hosted)

```bash
cp .env.example .env
# Edit .env with your production values

docker compose -f docker-compose.prod.yml up -d
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full self-hosting guide.

---

## Documentation

| Document | Description |
|---|---|
| [Product Brief](docs/PRODUCT_BRIEF.md) | Vision, personas, MVP scope and boundaries |
| [Architecture](docs/ARCHITECTURE.md) | Stack decisions, service diagram, hosting guide |
| [Domain Model](docs/DOMAIN_MODEL.md) | Entity definitions, relationships, and business rules |
| [Roadmap](docs/ROADMAP.md) | Phase 0–3 with goals and exit criteria |
| [Backlog](docs/BACKLOG.md) | Full epic and story list |
| [Contributing](CONTRIBUTING.md) | Branch strategy, commit format, PR process |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, commit conventions, and PR process.

---

## License

MIT
