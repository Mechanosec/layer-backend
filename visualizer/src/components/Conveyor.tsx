import type { Calculation, Trace } from '../api/types';
import type { Tone } from './ui';

interface Stage {
  key: string;
  index: string;
  title: string;
  what: string;
  value: string;
  tone: Tone;
  detail?: string;
}

/**
 * The route a stock number travels, left to right. Numbered because this really
 * is a sequence — each stage can only happen after the one before it.
 */
export function Conveyor({
  trace,
  calculation,
  pulseAt,
  ecomReachable,
}: {
  trace: Trace | null;
  calculation: Calculation | null;
  pulseAt: number | null;
  ecomReachable: boolean;
}) {
  const stages = buildStages(trace, calculation, ecomReachable);

  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stages.map((stage, index) => (
        <li key={stage.key} className="relative">
          {index > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 -left-2 hidden h-px w-2 bg-stage-line xl:block"
            >
              {pulseAt ? (
                <span
                  key={pulseAt}
                  className="link-pulse block h-px w-full bg-flow"
                  style={{ animationDelay: `${index * 130 - 60}ms` }}
                />
              ) : null}
            </span>
          ) : null}

          <article
            key={pulseAt ? `${stage.key}-${pulseAt}` : stage.key}
            className={`flex h-full flex-col rounded border border-stage-line bg-stage-raised p-3 ${
              pulseAt ? 'stage-pulse' : ''
            }`}
            style={pulseAt ? { animationDelay: `${index * 130}ms` } : undefined}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[0.65rem] text-stage-muted">
                {stage.index}
              </span>
              <StageValue tone={stage.tone}>{stage.value}</StageValue>
            </div>
            <h3 className="mt-1.5 font-mono text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
              {stage.title}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-stage-muted">
              {stage.what}
            </p>
            {stage.detail ? (
              <p className="mt-2 font-mono text-[0.65rem] text-stage-muted">
                {stage.detail}
              </p>
            ) : null}
          </article>
        </li>
      ))}
    </ol>
  );
}

function StageValue({
  tone,
  children,
}: {
  tone: Tone;
  children: string;
}) {
  const colours: Record<Tone, string> = {
    flow: 'text-flow',
    warn: 'text-warn',
    stop: 'text-stop',
    muted: 'text-stage-muted',
  };

  return (
    <span className={`tnum font-mono text-lg leading-none ${colours[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Events injected from the stand carry a `#simulated` suffix so their offsets
 * cannot collide with the real topic. That is plumbing, not something to explain
 * on screen.
 */
function topicLabel(topic: string): string {
  return topic.replace('#simulated', '');
}

function buildStages(
  trace: Trace | null,
  calculation: Calculation | null,
  ecomReachable: boolean,
): Stage[] {
  const events = trace?.events ?? [];
  const processed = events.filter((event) => event.status === 'PROCESSED');
  const failed = events.filter((event) => event.status === 'FAILED');
  const waiting = events.filter((event) => event.status === 'PENDING');
  const outbox = trace?.outbox ?? [];
  const queued = outbox.filter((row) => row.status !== 'SENT');
  const sent = outbox.filter((row) => row.status === 'SENT');
  const latestEvent = events[0];

  return [
    {
      key: 'bc',
      index: '01',
      title: 'Business Central',
      what: 'Каса й склад повідомляють, скільки товару лежить у конкретному магазині.',
      value: String(events.length),
      tone: events.length > 0 ? 'flow' : 'muted',
      detail: latestEvent
        ? latestEvent.type === 'PRODUCT'
          ? 'останнє: картка товару'
          : 'останнє: залишок'
        : 'подій ще не було',
    },
    {
      key: 'kafka',
      index: '02',
      title: 'Kafka',
      what: 'Повідомлення стає в чергу. Якщо сервіс лежав, воно дочекається його.',
      // Queue depth is the only number here a manager can act on.
      value: String(waiting.length),
      tone: waiting.length > 0 ? 'warn' : latestEvent ? 'flow' : 'muted',
      detail: latestEvent
        ? waiting.length > 0
          ? `${waiting.length} чекає обробки`
          : `${topicLabel(latestEvent.topic)} · нічого не чекає`
        : undefined,
    },
    {
      key: 'inbox',
      index: '03',
      title: 'Журнал подій',
      what: 'Кожне повідомлення записується один раз. Повторна доставка не подвоює залишок.',
      value: `${processed.length}/${events.length}`,
      tone: failed.length > 0 ? 'stop' : processed.length > 0 ? 'flow' : 'muted',
      detail:
        failed.length > 0
          ? `${failed.length} відкладено з помилкою`
          : 'опрацьовано без помилок',
    },
    {
      key: 'calc',
      index: '04',
      title: 'Розрахунок',
      what: 'Сума по магазинах мінус страховий запас мінус те, що вже в ордерах «Новий».',
      value: calculation ? String(calculation.quantity) : '—',
      tone: !calculation
        ? 'muted'
        : calculation.reservationsStale
          ? 'warn'
          : 'flow',
      detail: calculation
        ? calculation.reservationsStale
          ? 'резерв непідтверджений'
          : 'усі дані підтверджені'
        : 'ще не рахували',
    },
    {
      key: 'outbox',
      index: '05',
      title: 'Черга на сайт',
      what: 'Результат лягає в чергу в одній транзакції з розрахунком, тому не може зникнути.',
      value: queued.length > 0 ? String(queued.length) : String(sent.length),
      tone: queued.length > 0 ? 'warn' : sent.length > 0 ? 'flow' : 'muted',
      detail:
        queued.length > 0
          ? `${queued.length} чекає на відправку`
          : `${sent.length} відправлено`,
    },
    {
      key: 'ecom',
      index: '06',
      title: 'Сайт (ECOM)',
      what: 'Кількість, яку бачить покупець. Звідси ж беруться ордери «Новий» для розрахунку.',
      value: calculation?.publishedQuantity != null
        ? String(calculation.publishedQuantity)
        : '—',
      tone: !ecomReachable
        ? 'stop'
        : calculation?.publishedQuantity != null
          ? 'flow'
          : 'muted',
      detail: ecomReachable ? 'ECOM відповідає' : 'ECOM не відповідає',
    },
  ];
}
