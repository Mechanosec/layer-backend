import { useState } from 'react';

import type { ShopRef } from '../api/types';
import { Button, Field, Panel, Select, TextInput } from './ui';

export interface SendRequest {
  kind: 'product' | 'stock';
  sku: string;
  variantCode: string;
  shopCode: string;
  quantity: number;
  absolute: boolean;
}

/** The demo product, matching the sample Business Central sent. */
const DEMO = {
  sku: '200202',
  name: 'Кросівки жіночі',
  unitMeasure: 'ПАР',
  brand: 'NORBY',
  price: 699,
  season: {
    name: 'ВЕСНА 2025',
    startingDate: '2025-03-01',
    endingDate: '2025-05-31',
  },
  productHierarchy: {
    division: 'ОДЯГ',
    category: 'Кросівки',
    retailProductCode: 'КРОСІВКИ ЖІНОЧІ',
  },
  customCategoryCode: '6402999100',
  customCategoryCodeDescription: 'менш як 24 см',
  variants: [
    { variantCode: '000', barcodeNo: '770662476000', color: 'КОРИЧНЕВИЙ', size: '42' },
    { variantCode: '001', barcodeNo: '770662476001', color: 'КОРИЧНЕВИЙ', size: '44' },
    { variantCode: '002', barcodeNo: '770662476002', color: 'КОРИЧНЕВИЙ', size: '46' },
    { variantCode: '003', barcodeNo: '770662476003', color: 'КОРИЧНЕВИЙ', size: '48' },
  ],
};

/**
 * Stands in for Business Central. Sends the two messages BC sends: the product
 * card, and the quantities.
 */
export function StandPanel({
  shops,
  busy,
  onSend,
  onRecalculate,
}: {
  shops: ShopRef[];
  busy: boolean;
  onSend: (request: SendRequest) => void;
  onRecalculate: () => void;
}) {
  const [kind, setKind] = useState<'product' | 'stock'>('product');
  const [absolute, setAbsolute] = useState(true);
  const [sku, setSku] = useState(DEMO.sku);
  const [variantCode, setVariantCode] = useState(DEMO.variants[0].variantCode);
  const [shopCode, setShopCode] = useState('');
  const [quantity, setQuantity] = useState('10');

  const sellingShops = shops.filter((shop) => shop.includedInEcom);
  const effectiveShop = shopCode || sellingShops[0]?.code || shops[0]?.code || '';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number(quantity);

    if (kind === 'stock' && (!Number.isInteger(parsed) || !effectiveShop)) {
      return;
    }

    onSend({
      kind,
      sku,
      variantCode,
      shopCode: effectiveShop,
      quantity: parsed,
      absolute,
    });
  };

  return (
    <Panel
      title="Стенд Business Central"
      hint="Надсилає ті самі повідомлення, що надсилає BC. Нічого зайвого не вигадує."
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Тип повідомлення">
          <Select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as 'product' | 'stock')
            }
          >
            <option value="product">Картка товару</option>
            <option value="stock">Залишок у магазині</option>
          </Select>
        </Field>

        <p className="rounded border border-stage-line bg-stage px-3 py-2 text-xs leading-relaxed text-stage-muted">
          {kind === 'product'
            ? `BC описує товар і всі його розміри — сезон, бренд, ціну, штрихкоди. Кількості тут немає, тому залишок не змінюється. Надішле ${DEMO.variants.length} варіанти.`
            : absolute
              ? 'BC каже: «у цьому магазині зараз стільки». Попереднє значення замінюється.'
              : 'BC каже: «стало на стільки більше або менше». Значення коригується.'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Артикул">
            <TextInput
              value={sku}
              onChange={(event) => setSku(event.target.value.trim())}
              required
            />
          </Field>
          <Field
            label="Варіант"
            hint={kind === 'product' ? 'усі одразу' : undefined}
          >
            <TextInput
              value={variantCode}
              onChange={(event) => setVariantCode(event.target.value.trim())}
              disabled={kind === 'product'}
              required
            />
          </Field>
        </div>

        {kind === 'stock' ? (
          <>
            <Field
              label="Магазин"
              hint={
                shops.find((shop) => shop.code === effectiveShop)
                  ?.includedInEcom === false
                  ? 'Цей магазин не віддає товар в онлайн — його залишок у розрахунок не піде.'
                  : undefined
              }
            >
              <Select
                value={effectiveShop}
                onChange={(event) => setShopCode(event.target.value)}
              >
                {shops.map((shop) => (
                  <option key={shop.code} value={shop.code}>
                    {shop.code} · {shop.name ?? 'без назви'}
                    {shop.includedInEcom ? '' : ' — не для сайту'}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Як BC передає число"
              hint="BC ще не визначився, тому сервіс приймає обидва варіанти."
            >
              <Select
                value={absolute ? 'absolute' : 'delta'}
                onChange={(event) =>
                  setAbsolute(event.target.value === 'absolute')
                }
              >
                <option value="absolute">Стало (quantity)</option>
                <option value="delta">Зміна на (quantityDelta)</option>
              </Select>
            </Field>

            <Field label={absolute ? 'Стало' : 'Зміна на'}>
              <TextInput
                type="number"
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </Field>
          </>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" disabled={busy}>
            {busy ? 'Надсилаю…' : 'Надіслати з BC'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onRecalculate}
            disabled={busy}
          >
            Перерахувати
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-stage-muted">
          «Перерахувати» нічого не змінює на складі — лише переганяє наявні дані
          через формулу. Це те, що станеться після зміни страхового запасу.
        </p>
      </form>
    </Panel>
  );
}

export { DEMO as DEMO_PRODUCT };
