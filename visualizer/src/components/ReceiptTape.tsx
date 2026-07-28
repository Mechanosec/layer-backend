import type { Calculation, ShopLine, Trace } from '../api/types';
import { formatTime } from '../lib/format';

/**
 * The calculation printed as a stock-take tape: one line per shop, the
 * subtractions below, and the number the website gets as the total. It is the
 * one artefact a manager can read top to bottom and argue with.
 */
export function ReceiptTape({
  trace,
  calculation,
}: {
  trace: Trace;
  calculation: Calculation | null;
}) {
  const shops = trace.shops;
  const counted = shops.filter((shop) => shop.includedInEcom);
  const excluded = shops.filter((shop) => !shop.includedInEcom);

  return (
    <div className="mx-auto w-full max-w-[26rem]">
      <div aria-hidden className="tape-edge tape-edge-top" />

      <div className="bg-paper px-6 py-5 font-mono text-ink shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)]">
        <header className="text-center">
          <h2 className="text-[0.7rem] font-semibold tracking-[0.22em] uppercase">
            Калькулятор залишку
          </h2>
          <p className="mt-2 text-sm font-medium">
            {trace.sku} · {trace.variantCode}
          </p>
          <p className="text-xs text-ink-muted">{trace.name}</p>
          {trace.descriptor ? (
            <p className="text-xs text-ink-muted">{trace.descriptor}</p>
          ) : null}
          {trace.seasonName ? (
            <p className="text-[0.65rem] text-ink-muted">{trace.seasonName}</p>
          ) : null}
          {calculation ? (
            <p className="mt-2 text-[0.65rem] tracking-[0.1em] text-ink-muted uppercase">
              регіон {calculation.regionCode} · {calculation.regionName}
            </p>
          ) : null}
        </header>

        <Rule />

        <SectionLabel>Залишки в магазинах</SectionLabel>
        {shops.length === 0 ? (
          <p className="py-2 text-center text-xs text-ink-muted">
            Business Central ще нічого не надсилав
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {counted.map((shop) => (
              <ShopRow key={shop.shopCode} shop={shop} />
            ))}
            {excluded.map((shop) => (
              <ShopRow key={shop.shopCode} shop={shop} />
            ))}
          </ul>
        )}

        {excluded.length > 0 ? (
          <p className="mt-3 text-[0.65rem] leading-relaxed text-ink-muted">
            Перекреслені магазини не віддають товар в онлайн, тому їхній залишок
            у суму не входить.
          </p>
        ) : null}

        <Rule />

        {calculation ? (
          <>
            <TapeLine
              label="Разом у продажу"
              value={calculation.shopsTotal}
              emphasis
            />
            <TapeLine
              label="Страховий запас"
              value={calculation.safetyBuffer}
              sign="−"
            />
            <TapeLine
              label="В ордерах «Новий»"
              value={calculation.reserved}
              sign="−"
              note={
                calculation.reservationsStale
                  ? 'останнє відоме значення'
                  : undefined
              }
            />

            <div className="my-3 border-t-[3px] border-double border-ink/60" />

            <div className="flex items-baseline justify-between">
              <span className="text-[0.7rem] font-semibold tracking-[0.18em] uppercase">
                На сайті
              </span>
              <span className="tnum text-3xl leading-none font-semibold">
                {calculation.publishedQuantity ?? '—'}
              </span>
            </div>

            {calculation.withheld ? (
              <WithheldStamp calculation={calculation} />
            ) : null}

            <Rule />

            <dl className="space-y-1 text-[0.65rem] text-ink-muted">
              <MetaRow
                term="Розраховано"
                value={formatTime(calculation.calculatedAt)}
              />
              <MetaRow
                term="Відправлено на сайт"
                value={
                  calculation.publishedAt
                    ? formatTime(calculation.publishedAt)
                    : 'ще ні'
                }
              />
              <MetaRow
                term="Одиниця"
                value={trace.unitMeasure ?? 'шт'}
              />
            </dl>
          </>
        ) : (
          <p className="py-4 text-center text-xs text-ink-muted">
            Розрахунку ще не було. Надішліть подію зі стенду.
          </p>
        )}
      </div>

      <div aria-hidden className="tape-edge" />
    </div>
  );
}

function ShopRow({ shop }: { shop: ShopLine }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span
        className={
          shop.includedInEcom
            ? 'shrink-0 text-ink'
            : 'shrink-0 text-ink-muted line-through decoration-ink-muted'
        }
      >
        {shop.shopCode}
      </span>
      <span
        className={`truncate text-xs ${shop.includedInEcom ? 'text-ink-muted' : 'text-ink-muted line-through'}`}
      >
        {shop.shopName ?? 'без назви'}
      </span>
      <Leader />
      <span
        className={`tnum shrink-0 ${shop.includedInEcom ? '' : 'text-ink-muted line-through'}`}
      >
        {shop.quantity}
      </span>
    </li>
  );
}

function TapeLine({
  label,
  value,
  sign,
  note,
  emphasis,
}: {
  label: string;
  value: number;
  sign?: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="mt-1.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span className={`shrink-0 ${emphasis ? 'font-medium' : ''}`}>
          {sign ? <span className="mr-1 text-ink-muted">{sign}</span> : null}
          {label}
        </span>
        <Leader />
        <span className={`tnum shrink-0 ${emphasis ? 'font-medium' : ''}`}>
          {value}
        </span>
      </div>
      {note ? (
        <p className="mt-0.5 text-[0.65rem] text-warn">{note}</p>
      ) : null}
    </div>
  );
}

function WithheldStamp({ calculation }: { calculation: Calculation }) {
  const neverPublished = calculation.publishedQuantity === null;

  return (
    <div className="mt-4 border border-dashed border-stop/70 p-3">
      <p className="text-[0.65rem] font-semibold tracking-[0.18em] text-stop uppercase">
        {neverPublished ? 'На сайт ще не відправляли' : 'Нове число затримано'}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink">
        Порахували{' '}
        <span className="tnum font-semibold">{calculation.quantity}</span>, але
        на сайт не віддали
        {neverPublished
          ? '. Резерв з ECOM підтвердити не вдалося, а безпечного попереднього значення ще немає.'
          : `: сайт поки тримає ${calculation.publishedQuantity}. Нове число більше, а резерв з ECOM непідтверджений — підвищувати доступну кількість на непідтверджених даних небезпечно.`}
      </p>
      <p className="mt-2 text-[0.65rem] leading-relaxed text-ink-muted">
        Щойно ECOM відповість, число перерахується й поїде на сайт автоматично.
      </p>
    </div>
  );
}

function MetaRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0">{term}</dt>
      <Leader muted />
      <dd className="tnum shrink-0">{value}</dd>
    </div>
  );
}

function Leader({ muted }: { muted?: boolean } = {}) {
  return (
    <span
      aria-hidden
      className={`min-w-4 flex-1 translate-y-[-0.2rem] border-b border-dotted ${
        muted ? 'border-paper-line' : 'border-paper-line'
      }`}
    />
  );
}

function Rule() {
  return <div className="my-4 border-t border-dashed border-paper-line" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.65rem] tracking-[0.18em] text-ink-muted uppercase">
      {children}
    </h3>
  );
}
