import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

import { PrismaClient } from '../src/generated/prisma/client';
import {
  UNASSIGNED_REGION_CODE,
  UNASSIGNED_REGION_NAME,
} from '../src/modules/stock/constants/stock.constants';

/**
 * Regions and shops are reference data owned by Business Central; until that
 * mapping arrives over an integration, this seed provides enough of it to
 * exercise the calculation locally.
 */
const REGIONS = [
  {
    bcCode: UNASSIGNED_REGION_CODE,
    name: UNASSIGNED_REGION_NAME,
    safetyBuffer: 0,
    shops: [] as { code: string; name: string; includedInEcom: boolean }[],
  },
  {
    bcCode: 'CENTRAL',
    name: 'Центральний',
    safetyBuffer: 2,
    shops: [
      { code: '0119', name: 'Київ, Хрещатик', includedInEcom: true },
      { code: '0120', name: 'Київ, Оболонь', includedInEcom: true },
      // Deliberately excluded: its stock must not reach e-com.
      { code: '0121', name: 'Київ, склад', includedInEcom: false },
    ],
  },
  {
    bcCode: 'WEST',
    name: 'Західний',
    safetyBuffer: 1,
    shops: [{ code: '0230', name: 'Львів, центр', includedInEcom: true }],
  },
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    for (const region of REGIONS) {
      const saved = await prisma.region.upsert({
        where: { bcCode: region.bcCode },
        create: { bcCode: region.bcCode, name: region.name, safetyBuffer: region.safetyBuffer },
        update: { name: region.name, safetyBuffer: region.safetyBuffer },
      });

      for (const shop of region.shops) {
        await prisma.shop.upsert({
          where: { code: shop.code },
          create: { ...shop, regionId: saved.id },
          update: { name: shop.name, includedInEcom: shop.includedInEcom, regionId: saved.id },
        });
      }
    }

    const [regions, shops] = await Promise.all([prisma.region.count(), prisma.shop.count()]);
    console.log(`Seeded ${regions} region(s) and ${shops} shop(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
