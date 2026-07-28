/**
 * Stand-in for the e-com reservations API, for local demos.
 *
 * The real endpoint answers "how many units of this variant sit in orders with
 * status «Новий»?". This one answers with whatever it has been told, and can be
 * made to fail on demand so the layer service's behaviour without fresh
 * reservations can be demonstrated.
 *
 *   pnpm mock:ecom
 *
 *   GET  /api/reservations?sku=&variantCode=&regionCode=  → { reserved }
 *   GET  /_state                                          → current state
 *   PUT  /_state   { "reserved": 4, "mode": "ok" }         → set state
 *
 * Modes: ok | down (503) | slow (never answers in time) | garbage (wrong shape)
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_ECOM_PORT ?? 4000);
const SLOW_DELAY_MS = 30_000;

const state = { reserved: 0, mode: 'ok' };

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    // The visualiser drives this from the browser.
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);

  if (request.method === 'OPTIONS') {
    return json(response, 204, {});
  }

  if (url.pathname === '/_state') {
    if (request.method === 'PUT') {
      let patch;
      try {
        patch = await readBody(request);
      } catch {
        return json(response, 400, { error: 'body must be JSON' });
      }

      if (patch.mode && !['ok', 'down', 'slow', 'garbage'].includes(patch.mode)) {
        return json(response, 400, {
          error: 'mode must be one of ok, down, slow, garbage',
        });
      }
      if (patch.reserved !== undefined && !Number.isInteger(patch.reserved)) {
        return json(response, 400, { error: 'reserved must be an integer' });
      }

      Object.assign(state, patch);
      console.log(`state → ${JSON.stringify(state)}`);
    }

    return json(response, 200, state);
  }

  if (url.pathname === '/api/reservations') {
    const sku = url.searchParams.get('sku');
    const variantCode = url.searchParams.get('variantCode');
    console.log(
      `reservations ${sku}/${variantCode} region=${url.searchParams.get('regionCode')} → mode=${state.mode}`,
    );

    switch (state.mode) {
      case 'down':
        return json(response, 503, { error: 'e-com is unavailable' });
      case 'garbage':
        return json(response, 200, { unexpected: 'shape' });
      case 'slow':
        setTimeout(
          () => json(response, 200, { sku, variantCode, reserved: state.reserved }),
          SLOW_DELAY_MS,
        );
        return undefined;
      default:
        return json(response, 200, {
          sku,
          variantCode,
          reserved: state.reserved,
        });
    }
  }

  return json(response, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`mock e-com listening on http://localhost:${PORT}`);
  console.log(`  reservations: /api/reservations?sku=200202&variantCode=000`);
  console.log(`  control:      PUT /_state {"reserved":4,"mode":"ok"}`);
});
