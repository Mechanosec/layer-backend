import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, ApiError } from './api/client';
import type {
  Calculation,
  EcomState,
  Health,
  PipelineEvent,
  OutboxRow,
  Stand,
  Trace,
} from './api/types';
import { ActivityLog } from './components/ActivityLog';
import { Conveyor } from './components/Conveyor';
import { EcomStand } from './components/EcomStand';
import { ReceiptTape } from './components/ReceiptTape';
import { DEMO_PRODUCT, StandPanel, type SendRequest } from './components/StandPanel';
import { Empty, Panel, StatusDot } from './components/ui';

const POLL_MS = 1500;

export default function App() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [ecom, setEcom] = useState<EcomState | null>(null);
  const [activity, setActivity] = useState<{
    events: PipelineEvent[];
    outbox: OutboxRow[];
  }>({ events: [], outbox: [] });

  const [selected, setSelected] = useState({
    sku: DEMO_PRODUCT.sku,
    variantCode: DEMO_PRODUCT.variants[0].variantCode,
  });
  const [regionCode, setRegionCode] = useState<string | null>(null);
  const [pulseAt, setPulseAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Kept in a ref so the polling effect does not restart on every selection.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextStand, nextActivity] = await Promise.all([
        api.getHealth(),
        api.getStand(),
        api.getActivity(),
      ]);

      setHealth(nextHealth);
      setStand(nextStand);
      setActivity(nextActivity);
      setOffline(false);
    } catch {
      setOffline(true);
      return;
    }

    const { sku, variantCode } = selectedRef.current;

    try {
      setTrace(await api.getTrace(sku, variantCode));
    } catch (error) {
      // A SKU nobody has sent yet is an ordinary state, not a failure.
      if (error instanceof ApiError && error.status === 404) {
        setTrace(null);
      }
    }

    try {
      setEcom(await api.getEcomState());
    } catch {
      setEcom(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [refresh]);

  const calculation = useMemo<Calculation | null>(() => {
    if (!trace || trace.calculations.length === 0) {
      return null;
    }

    return (
      trace.calculations.find((item) => item.regionCode === regionCode) ??
      trace.calculations[0]
    );
  }, [trace, regionCode]);

  const act = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);

    try {
      await action();
      setPulseAt(Date.now());
      await refresh();
    } catch (error) {
      setNotice(
        `${label} не вдалося: ${error instanceof Error ? error.message : 'невідома помилка'}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const send = (request: SendRequest) => {
    setSelected({ sku: request.sku, variantCode: request.variantCode });
    selectedRef.current = { sku: request.sku, variantCode: request.variantCode };

    void act('Надіслати подію', () =>
      request.kind === 'product'
        ? api.sendProduct({ ...DEMO_PRODUCT, sku: request.sku })
        : api.sendStock({
            sku: request.sku,
            warehouseCode: request.shopCode,
            variants: [
              {
                variantCode: request.variantCode,
                ...(request.absolute
                  ? { quantity: request.quantity }
                  : { quantityDelta: request.quantity }),
              },
            ],
          }),
    );
  };

  return (
    <div className="min-h-dvh">
      <header className="border-b border-stage-line px-5 py-4">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.65rem] tracking-[0.2em] text-stage-muted uppercase">
              Layer · склад → сайт
            </p>
            <h1 className="mt-1 font-mono text-xl font-semibold tracking-tight">
              Звідки береться кількість на сайті
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stage-muted">
              Надішліть подію так, як її надсилає Business Central, і подивіться,
              що з нею станеться до моменту, коли її побачить покупець.
            </p>
          </div>

          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <StatusDot
              tone={offline ? 'stop' : health?.status === 'ok' ? 'flow' : 'warn'}
              label={
                offline
                  ? 'сервіс layer не відповідає'
                  : health?.status === 'ok'
                    ? 'сервіс layer працює'
                    : 'сервіс layer вимагає уваги'
              }
            />
            <StatusDot
              tone={ecom?.mode === 'ok' ? 'flow' : 'stop'}
              label={
                ecom
                  ? ecom.mode === 'ok'
                    ? 'ECOM відповідає'
                    : 'ECOM не відповідає'
                  : 'ECOM недосяжний'
              }
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[100rem] space-y-4 px-5 py-5">
        {offline ? (
          <p className="rounded border border-stop/50 bg-stop/10 px-4 py-3 text-sm">
            Не бачу сервіс layer на localhost:3000. Запустіть його командою{' '}
            <code className="font-mono">pnpm start:dev</code> у layer-backend.
          </p>
        ) : null}

        {notice ? (
          <p className="rounded border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
            {notice}
          </p>
        ) : null}

        <Conveyor
          trace={trace}
          calculation={calculation}
          pulseAt={pulseAt}
          ecomReachable={ecom?.mode === 'ok'}
        />

        <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)_24rem]">
          <div className="space-y-4">
            <StandPanel
              shops={stand?.shops ?? []}
              busy={busy}
              onSend={send}
              onRecalculate={() =>
                void act('Перерахувати', () =>
                  api.recalculate(selected.sku, selected.variantCode),
                )
              }
            />
            <div className="xl:hidden">
              <EcomStand
                state={ecom}
                health={health}
                busy={busy}
                onChange={(patch) =>
                  void act('Змінити ECOM', () => api.setEcomState(patch))
                }
              />
            </div>
          </div>

          <Panel
            title="Розрахунок"
            hint="Той самий порядок дій, що в сервісі: спершу магазини, потім вирахування."
            aside={
              trace && trace.calculations.length > 1 ? (
                <div className="flex gap-1">
                  {trace.calculations.map((item) => (
                    <button
                      key={item.regionCode}
                      type="button"
                      onClick={() => setRegionCode(item.regionCode)}
                      className={`rounded border px-2 py-1 font-mono text-[0.65rem] transition-colors ${
                        item.regionCode === calculation?.regionCode
                          ? 'border-flow text-flow'
                          : 'border-stage-line text-stage-muted hover:border-stage-muted'
                      }`}
                    >
                      {item.regionCode}
                    </button>
                  ))}
                </div>
              ) : null
            }
          >
            {trace ? (
              <ReceiptTape trace={trace} calculation={calculation} />
            ) : (
              <Empty>
                Про {selected.sku}:{selected.variantCode} ще нічого не відомо.
                Надішліть повний залишок зі стенду.
              </Empty>
            )}
          </Panel>

          <div className="hidden xl:block">
            <EcomStand
              state={ecom}
              health={health}
              busy={busy}
              onChange={(patch) =>
                void act('Змінити ECOM', () => api.setEcomState(patch))
              }
            />
          </div>
        </div>

        <ActivityLog
          events={activity.events}
          outbox={activity.outbox}
          now={now}
        />
      </main>
    </div>
  );
}
