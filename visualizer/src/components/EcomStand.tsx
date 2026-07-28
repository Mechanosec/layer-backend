import { useEffect, useState } from 'react';

import type { EcomState, Health } from '../api/types';
import { Button, Field, Panel, StatusDot, TextInput } from './ui';

/**
 * The e-com side of the stand. Reservations genuinely live in e-com, so this is
 * where the manager sets them — and where they can pull the plug to see what the
 * service does when e-com cannot answer.
 */
export function EcomStand({
  state,
  health,
  busy,
  onChange,
}: {
  state: EcomState | null;
  health: Health | null;
  busy: boolean;
  onChange: (patch: Partial<EcomState>) => void;
}) {
  const [reserved, setReserved] = useState('0');
  const serverReserved = state?.reserved;

  // Follow the server, so the field matches what e-com actually reports.
  useEffect(() => {
    if (serverReserved !== undefined) {
      setReserved(String(serverReserved));
    }
  }, [serverReserved]);

  const reachable = state?.mode === 'ok';
  const backlog = health?.reservations;

  return (
    <Panel
      title="Сторона ECOM"
      hint="Ордери живуть в ECOM, тому кількість у статусі «Новий» задається тут."
      aside={
        <StatusDot
          tone={reachable ? 'flow' : 'stop'}
          label={reachable ? 'відповідає' : 'не відповідає'}
        />
      }
    >
      <div className="space-y-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = Number(reserved);
            if (Number.isInteger(parsed) && parsed >= 0) {
              onChange({ reserved: parsed });
            }
          }}
        >
          <Field
            label="В ордерах «Новий»"
            hint="Товар уже обіцяний покупцям, тому з доступного на сайті він знімається."
          >
            <TextInput
              type="number"
              min={0}
              step={1}
              value={reserved}
              onChange={(event) => setReserved(event.target.value)}
            />
          </Field>
          <div className="mt-2">
            <Button type="submit" variant="ghost" disabled={busy}>
              Зберегти резерв
            </Button>
          </div>
        </form>

        <div className="border-t border-stage-line pt-3">
          <p className="font-mono text-[0.65rem] tracking-[0.12em] text-stage-muted uppercase">
            Що буде, якщо ECOM недоступний
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              disabled={busy || reachable}
              onClick={() => onChange({ mode: 'ok' })}
            >
              Увімкнути ECOM
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !reachable}
              onClick={() => onChange({ mode: 'down' })}
            >
              Вимкнути ECOM
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-stage-muted">
            Поки ECOM молчить, сервіс не вважає, що резерв нульовий — це завищило
            б залишок. Він бере останнє відоме значення, помічає число як
            непідтверджене й повторює спробу.
          </p>
        </div>

        {backlog ? (
          <dl className="grid grid-cols-3 gap-2 border-t border-stage-line pt-3">
            <Metric
              label="Чекає"
              value={backlog.pendingRecalculations}
              tone={backlog.pendingRecalculations > 0 ? 'warn' : 'muted'}
            />
            <Metric
              label="Здалися"
              value={backlog.abandonedRecalculations}
              tone={backlog.abandonedRecalculations > 0 ? 'stop' : 'muted'}
            />
            <Metric
              label="Непідтверджені"
              value={backlog.staleQuantities}
              tone={backlog.staleQuantities > 0 ? 'warn' : 'muted'}
            />
          </dl>
        ) : null}
      </div>
    </Panel>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'warn' | 'stop' | 'muted';
}) {
  const colours = {
    warn: 'text-warn',
    stop: 'text-stop',
    muted: 'text-stage-ink',
  } as const;

  return (
    <div>
      <dt className="font-mono text-[0.6rem] tracking-[0.1em] text-stage-muted uppercase">
        {label}
      </dt>
      <dd className={`tnum mt-0.5 font-mono text-xl ${colours[tone]}`}>
        {value}
      </dd>
    </div>
  );
}
