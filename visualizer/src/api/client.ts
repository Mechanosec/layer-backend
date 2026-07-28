import type {
  EcomState,
  Health,
  OutboxRow,
  PipelineEvent,
  ProductCommand,
  Stand,
  StockCommand,
  Trace,
} from './types';

/** Both services are reached through the dev-server proxy — see vite.config.ts. */
const LAYER = '/api/layer';
const ECOM = '/api/ecom';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Сервіс не відповідає', 0);
  }

  if (!response.ok) {
    // Nest error bodies carry `message`, which is either a string or a list.
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const detail = Array.isArray(body?.message)
      ? body.message.join('; ')
      : body?.message;

    throw new ApiError(detail ?? `HTTP ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getHealth: () => request<Health>(`${LAYER}/health`),

  getStand: () => request<Stand>(`${LAYER}/pipeline/stand`),

  getActivity: () =>
    request<{ events: PipelineEvent[]; outbox: OutboxRow[] }>(
      `${LAYER}/pipeline/activity`,
    ),

  getTrace: (sku: string, variantCode: string) =>
    request<Trace>(
      `${LAYER}/pipeline/trace/${encodeURIComponent(sku)}/${encodeURIComponent(variantCode)}`,
    ),

  sendProduct: (command: ProductCommand) =>
    request<{ outcome: string }>(`${LAYER}/bc/simulate/product`, {
      method: 'POST',
      body: JSON.stringify(command),
    }),

  sendStock: (command: StockCommand) =>
    request<{ outcome: string }>(`${LAYER}/bc/simulate/stock`, {
      method: 'POST',
      body: JSON.stringify(command),
    }),

  recalculate: (sku: string, variantCode: string) =>
    request<unknown[]>(
      `${LAYER}/stock/${encodeURIComponent(sku)}/${encodeURIComponent(variantCode)}/recalculate`,
      { method: 'POST' },
    ),

  getEcomState: () => request<EcomState>(`${ECOM}/_state`),

  setEcomState: (patch: Partial<EcomState>) =>
    request<EcomState>(`${ECOM}/_state`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
};
