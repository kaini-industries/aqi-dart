# Air Equivalent

Air Equivalent is a map-first view of current North American PM2.5 conditions. It displays AirNow's PM2.5 NowCast AQI unchanged and translates the latest raw PM2.5 concentration into a rough cigarette-equivalent rate:

```text
projected cigarette-equivalents per day = PM2.5 (µg/m³) / 22
```

The comparison is an explanatory analogy, not a personal exposure estimate or medical advice. Indoor filtration, time outside, activity, masks, monitor distance, particle composition, and missing readings can all change real exposure.

## Run locally

Requirements: Node.js 24 and pnpm 11.9.

```sh
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables are required for the basic app: it requests the latest public AirNow hourly file and falls back to clearly labeled bundled demonstration readings if the provider cannot be reached.

## Data modes

| Mode | Configuration | Current map | 24-hour history |
| --- | --- | --- | --- |
| Live | No database | Latest usable AirNow file, with demo fallback | Not persisted |
| Database | `DATABASE_URL` | Latest imported observations | Available after manual collection |
| Free scheduled | Database mode + secured GitHub Actions workflow | Latest imported observations | Builds automatically from hourly imports |

AirNow observations are preliminary. The app preserves the source observation timestamp and source AQI; fetch time is never presented as observation time. Readings older than six hours are excluded from the default current map.

## Deploy to Vercel

1. Import this repository from [Vercel's New Project page](https://vercel.com/new).
2. Keep the detected Next.js, pnpm, and build settings.
3. Deploy with no variables for the live/demo mode.

That path works on Vercel Hobby because the checked-in `vercel.json` contains no unsupported hourly cron. To retain history without upgrading Vercel:

1. connect a Neon Free Postgres database;
2. apply [`db/schema.sql`](db/schema.sql) and configure `DATABASE_URL`;
3. configure the same `CRON_SECRET` in Vercel Production and GitHub Actions; and
4. enable the optional [hourly collection workflow](.github/workflows/collect.yml) with the repository variable `AQI_COLLECTION_ENABLED=true`.

The workflow calls the secured production collector at minute `43` of each hour. GitHub schedules can be delayed or occasionally dropped, so the application continues to expose true timestamps and freshness. Native Vercel Cron remains an optional Pro path through `vercel.pro.json`.

See [`docs/DEPLOYING.md`](docs/DEPLOYING.md) for the complete Neon, secret, cron, and troubleshooting instructions.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | No | Pooled Neon/Postgres connection string for persistence and history. |
| `CRON_SECRET` | Scheduled collection only | Bearer secret shared with GitHub Actions or sent by native Vercel Cron. |
| `AIRNOW_BASE_URL` | No | AirNow file host override; defaults to `https://files.airnowtech.org`. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | No | MapLibre style URL; defaults to OpenFreeMap Positron. |

## Quality checks

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

GitHub Actions runs type checking, unit tests, a production build, and Chromium browser tests for pull requests and pushes to `main`.

## API

- `GET /api/v1/readings?bbox=west,south,east,north`
- `GET /api/v1/stations/:id/history?hours=24`
- `GET /api/health`
- `GET /api/internal/cron/ingest` (Bearer-authenticated)
- `GET /api/internal/cron/reconcile` (Bearer-authenticated)

The implementation rationale, acceptance criteria, and source references are recorded in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).
