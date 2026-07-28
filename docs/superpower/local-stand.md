# Local stand

## What it enables

The whole flow — containers, service, e-com stub and a visual page — from one
command, so the calculation can be demonstrated and argued about without reading
logs.

## How it works

```bash
./start-demo.sh        # or: pnpm demo
```

The script checks the environment, picks the container runtime (Docker, or Podman via
its user socket), refuses to start if ports 3000/4000/5173 are taken, creates `.env`
from the example and backfills missing keys, installs dependencies, brings up Postgres
and Kafka, waits for them to actually answer, runs `prisma generate`, `migrate deploy`
and the seed, then starts three services and waits for each to respond.

`Ctrl+C` stops what it started; each service runs in its own session so the process
group can be killed whole (otherwise `pnpm` exits and `node` survives). Containers stay
up so the database persists — `pnpm infra:down` stops them. Logs land in `.demo-logs/`.

Flags: `--fresh` (wipe demo products and events, keep the reference data),
`--no-install`, `--no-open`.

### Pieces

- **`tools/mock-ecom.mjs`** (`pnpm mock:ecom`) — stands in for the e-com reservations
  API. `PUT /_state` switches between `ok`, `down`, `slow` and `garbage`, which is how
  the no-fresh-reservations path gets exercised.
- **`../layer-visualizer`** — a Vite/React page in Ukrainian that renders the six
  pipeline stages, the calculation as a stock-take tape, and a journal of what came in
  and went out. Read-only apart from the endpoints it calls; it reads `/pipeline/*`.

### Caveat

`Ctrl+C` relies on a trapped `SIGINT`. A process backgrounded from a non-interactive
shell inherits `SIGINT` as ignored and `trap` cannot override that, so scripted
launches should stop it with `kill -TERM`.

## Related modules

- `docs/modules/pipeline.md`, `docs/modules/shared.md`
- `docs/superpower/ecom-reservations.md`
