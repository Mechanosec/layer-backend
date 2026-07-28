import type { ReactNode } from 'react';

export function Panel({
  title,
  hint,
  aside,
  children,
}: {
  title: string;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-stage-line bg-stage-raised">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-stage-line px-4 py-3">
        <div>
          <h2 className="font-mono text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
            {title}
          </h2>
          {hint ? (
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-stage-muted">
              {hint}
            </p>
          ) : null}
        </div>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[0.65rem] tracking-[0.12em] text-stage-muted uppercase">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-stage-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  'mt-1.5 w-full rounded border border-stage-line bg-stage px-2.5 py-2 font-mono text-sm text-stage-ink transition-colors hover:border-stage-muted focus:border-flow focus:outline-none';

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
): ReactNode {
  return <input {...props} className={CONTROL} />;
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
): ReactNode {
  return <select {...props} className={CONTROL} />;
}

export function Button({
  variant = 'primary',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-accent text-white hover:bg-accent/85'
      : 'border border-stage-line text-stage-ink hover:border-stage-muted';

  return (
    <button
      {...props}
      className={`rounded px-3 py-2 font-mono text-xs font-medium tracking-[0.08em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

const TONES = {
  flow: 'text-flow',
  warn: 'text-warn',
  stop: 'text-stop',
  muted: 'text-stage-muted',
} as const;

export type Tone = keyof typeof TONES;

export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-xs whitespace-nowrap ${TONES[tone]}`}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current"
        style={{ boxShadow: '0 0 0 3px color-mix(in oklab, currentColor 22%, transparent)' }}
      />
      {label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-stage-muted">{children}</p>
  );
}
