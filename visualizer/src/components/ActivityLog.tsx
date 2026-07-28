import type { OutboxRow, PipelineEvent } from '../api/types';
import { formatAgo, plural } from '../lib/format';
import { Empty, Panel } from './ui';

type Entry =
  | { kind: 'event'; at: string; event: PipelineEvent }
  | { kind: 'outbox'; at: string; row: OutboxRow };

/**
 * One list, both directions: what came in from Business Central and what went
 * out to the site, newest first, so cause and effect sit next to each other.
 */
export function ActivityLog({
  events,
  outbox,
  now,
}: {
  events: PipelineEvent[];
  outbox: OutboxRow[];
  now: number;
}) {
  const entries: Entry[] = [
    ...events.map((event) => ({
      kind: 'event' as const,
      at: event.receivedAt,
      event,
    })),
    ...outbox.map((row) => ({ kind: 'outbox' as const, at: row.createdAt, row })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 18);

  return (
    <Panel
      title="Журнал"
      hint="Ліворуч — що прийшло зі складу, праворуч — що поїхало на сайт."
    >
      {entries.length === 0 ? (
        <Empty>Поки тихо. Надішліть подію зі стенду.</Empty>
      ) : (
        <ol className="divide-y divide-stage-line">
          {entries.map((entry) => (
            <li
              key={
                entry.kind === 'event'
                  ? `e-${entry.event.topic}-${entry.event.partition}-${entry.event.offset}`
                  : `o-${entry.row.sku}-${entry.row.createdAt}-${entry.row.quantity}`
              }
              className="flex items-baseline gap-3 py-2 font-mono text-xs"
            >
              <span className="w-20 shrink-0 text-stage-muted">
                {formatAgo(entry.at, now)}
              </span>
              {entry.kind === 'event' ? (
                <EventRow event={entry.event} />
              ) : (
                <OutboxEntryRow row={entry.row} />
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function EventRow({ event }: { event: PipelineEvent }) {
  const summary = summarise(event);
  const tone =
    event.status === 'FAILED'
      ? 'text-stop'
      : event.status === 'PROCESSED'
        ? 'text-stage-ink'
        : 'text-warn';

  return (
    <>
      <span className="w-6 shrink-0 text-accent">◀</span>
      <span className={`flex-1 ${tone}`}>
        {summary}
        {event.status === 'FAILED' && event.error ? (
          <span className="text-stop"> · {event.error}</span>
        ) : null}
      </span>
    </>
  );
}

function OutboxEntryRow({ row }: { row: OutboxRow }) {
  const tone =
    row.status === 'FAILED'
      ? 'text-stop'
      : row.status === 'SENT'
        ? 'text-flow'
        : 'text-warn';

  return (
    <>
      <span className="w-6 shrink-0 text-flow">▶</span>
      <span className={`flex-1 ${tone}`}>
        на сайт {row.sku}:{row.variantCode} · {row.regionCode} →{' '}
        <span className="tnum">{row.quantity}</span>
        {row.status === 'PENDING' ? ' · у черзі' : ''}
        {row.status === 'FAILED' && row.lastError
          ? ` · ${row.lastError}`
          : ''}
      </span>
    </>
  );
}

/**
 * One readable line per message. Business Central sends several shapes, so the
 * payload is read defensively rather than assumed.
 */
function summarise(event: PipelineEvent): string {
  const payload = event.payload as {
    sku?: string;
    warehouseCode?: string;
    variants?: {
      variantCode?: string;
      quantity?: number;
      quantityDelta?: number;
      warehouses?: {
        warehouseCode?: string;
        quantity?: number;
        quantityDelta?: number;
      }[];
    }[];
  };

  const sku = payload.sku ?? event.key ?? '—';
  const variants = payload.variants ?? [];

  if (event.type === 'PRODUCT') {
    return `картка ${sku} · ${variants.length} ${plural(variants.length, 'варіант', 'варіанти', 'варіантів')}`;
  }

  const lines = variants.flatMap((variant) => {
    const places = variant.warehouses ?? [
      {
        warehouseCode: payload.warehouseCode,
        quantity: variant.quantity,
        quantityDelta: variant.quantityDelta,
      },
    ];

    return places.map(
      (place) =>
        `${variant.variantCode ?? '—'}@${place.warehouseCode ?? '—'}→${formatNumber(place)}`,
    );
  });

  return `залишок ${sku} · ${lines.join(', ')}`;
}

function formatNumber(place: {
  quantity?: number;
  quantityDelta?: number;
}): string {
  if (place.quantity !== undefined) {
    return String(place.quantity);
  }
  if (place.quantityDelta !== undefined) {
    return place.quantityDelta > 0
      ? `+${place.quantityDelta}`
      : String(place.quantityDelta);
  }

  return '—';
}
