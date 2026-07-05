# WhatsApp Agent Base

**AI-powered WhatsApp Business Platform** — automated customer service, order management, lead capture, and analytics with a full admin panel.

Built on Next.js 16, Drizzle ORM, and the Vercel AI SDK with OpenAI. Integrates with YCloud for WhatsApp messaging and supports Telegram as a secondary channel.

---

## Features

### AI Agent
- 15-tool OpenAI assistant with context-aware conversation handling
- **Hallucination guard**: loop detection, anti-spam, prompt security
- Automatic order placement, product lookup, lead enrichment, address management
- Configurable system prompt and business rules via admin panel

### WhatsApp Integration (YCloud)
- Inbound webhook → lead capture → conversation management
- Two-way messaging with media support (images, audio, documents)
- Auto-reply within 24h window, human override for complex queries
- Duplicate order detection with configurable time window

### Admin Panel
| Section | Description |
|---------|-------------|
| **Dashboard** | Stats, recent activity, action cards |
| **Conversations** | 3-panel inbox — sidebar, chat, context panel. Human takeover, message history with media |
| **Products** | Full CRUD, search/filter/paginate, stock management, variants, promo pricing |
| **Orders** | Status workflow (pending → preparing → ready → delivered), payment tracking, search |
| **Promotions** | CRUD with product bundles, custom pricing, active/inactive toggle |
| **Leads** | Full CRUD, detail sheet, status tracking (new → contacted → converted → lost) |
| **Agent Config** | 7-section collapsible form — General, WhatsApp Bot, Telegram Bot, WhatsApp Agent, Business Ops, Business Status, Meta OAuth |
| **Analytics** | Daily order time series, revenue stats, lead conversion rate, top products |

### Telegram Integration
- Bot-based notifications and fallback channel
- Configurable token, chat ID, and webhook

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript 5 |
| **Database** | PostgreSQL (Neon) + Drizzle ORM |
| **Auth** | NextAuth v5 (Credentials provider) |
| **AI** | Vercel AI SDK + OpenAI (GPT-4o) |
| **WhatsApp** | YCloud API |
| **UI** | Tailwind CSS 4, Radix UI primitives, Framer Motion, Lucide icons |
| **Rate Limiting** | Upstash Redis |
| **Encryption** | AES-256 via SHA-256 derived key |
| **Logging** | Pino with pretty-print |

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database (Neon or local)
- OpenAI API key
- YCloud account (WhatsApp provider)
- Upstash Redis (rate limiting)

### Setup

```bash
# clone and install
git clone https://github.com/adriangmrraa/whatsapp-agent-base.git
cd whatsapp-agent-base
npm install

# environment
cp .env.example .env.local
# fill in DATABASE_URL, AUTH_SECRET, OPENAI_API_KEY, YCLOUD_API_KEY, UPSTASH_REDIS_*
# generate AUTH_SECRET: openssl rand -base64 32

# database
npm run db:push
npm run db:seed

# dev
npm run dev
```

### First Login

1. Open `http://localhost:3000/login`
2. Default credentials (set via `ADMIN_PASSWORD` env):
   - **Email**: `admin@example.com`
   - **Password**: from `ADMIN_PASSWORD` (default: `admin123`)

> Change `ADMIN_PASSWORD` before going to production.

---

## Architecture

```
src/
├── app/
│   ├── (admin)/admin/   # Admin panel (protected)
│   │   ├── agent/       # Agent configuration
│   │   ├── analytics/   # Dashboard analytics
│   │   ├── conversations/# 3-panel inbox
│   │   ├── leads/       # Lead management
│   │   ├── orders/      # Order CRUD
│   │   ├── products/    # Product CRUD
│   │   ├── promotions/  # Promotions CRUD
│   │   └── page.tsx     # Dashboard overview
│   ├── login/           # Auth
│   └── api/             # API routes
│       ├── auth/        # NextAuth
│       └── webhook/     # YCloud WhatsApp webhook
├── auth/                # NextAuth configuration
├── components/ui/       # UI primitives (Button, Card, Input, etc.)
├── db/                  # Schema, connection, seed
│   └── schema.ts        # 10 tables, 8 enums
├── lib/
│   ├── agent/           # AI agent (system prompt, 15 tools, orchestrator)
│   ├── whatsapp/        # WhatsApp message handlers
│   ├── ycloud/          # YCloud API client
│   └── conversations/   # Conversation business logic
└── types/               # Shared TypeScript types
```

### Key Data Model

- **Conversations** — WhatsApp threads with message history, human override, metadata
- **Leads** — Captured contacts with UTM tracking, tags, status pipeline
- **Products** — Catalog with variants, pricing, stock, promo support
- **Orders** — From lead context → order with status workflow + delivery tracking
- **AgentConfig** — Single-row configuration for all agent behavior
- **Promotions** — Product bundles with custom pricing
- **Attachments** — Media files linked to leads, conversations, and messages

---

## Database

The schema defines 10 tables and 8 PostgreSQL enums. `drizzle-kit` manages migrations:

```bash
npm run db:generate   # Generate migration
npm run db:push       # Push schema (dev)
npm run db:migrate    # Apply migrations
npm run db:seed       # Seed initial admin user
npm run db:studio     # Drizzle Studio (GUI)
```

---

## API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/auth/[...nextauth]` | NextAuth credentials login |
| `POST /api/webhook/whatsapp` | YCloud inbound webhook — message receive, status callbacks |

All admin routes are server-rendered, `force-dynamic`. No REST API for admin operations — server actions handle all mutations.

---

## Admin Panel Screens

Login → protected admin routes. UI primitives use Radix UI + Tailwind CSS 4 with a neutral dark theme.

- **Dashboard**: Stats cards, recent orders, action shortcuts
- **Conversations**: Real-time 3-panel inbox with React Query polling
- **Products**: Filterable grid, inline availability toggle, variants editor
- **Orders**: Status management with payment tracking, search
- **Leads**: Detail sheet with status workflow and conversation link
- **Promotions**: Product bundles, active/inactive toggle
- **Agent Config**: 7 collapsible sections, global save with toast feedback
- **Analytics**: Server-rendered metrics, date range toggle (7d/30d)

---

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth encryption secret |
| `OPENAI_API_KEY` | OpenAI API key for AI agent |
| `YCLOUD_API_KEY` | YCloud WhatsApp API key |
| `YCLOUD_WEBHOOK_SECRET` | Webhook signature verification |
| `UPSTASH_REDIS_REST_URL` | Rate limiting backend |
| `ENCRYPTION_KEY` | 32+ char string for AES encryption |
| `DUPLICATE_ORDER_WINDOW_MINUTES` | Duplicate detection window (default 15) |

---

## Deployment

Deploy to any Node.js 20+ hosting:

```bash
npm run build
npm start
```

For Vercel: connect the repo, set env vars, build command `npm run build` auto-detected.

---

## License

MIT
