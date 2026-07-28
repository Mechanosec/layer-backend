# health

## Purpose

Liveness plus the one operational signal that matters here: whether published
quantities rest on confirmed reservations.

## Key responsibilities

- Check database connectivity
- Report the recalculation backlog: pending, abandoned, and stale quantities
- Return `degraded` once any calculation has been abandoned — the service still
  serves traffic, but numbers on the site may be out of date

## Public API / Exports

- `GET /health` → `{ status, database, reservations: { pendingRecalculations,
  abandonedRecalculations, staleQuantities }, uptimeSeconds }`

## Dependencies

- `StockModule` (backlog counts), `EcomModule` (stale count), `shared/database`
