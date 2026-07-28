import { Injectable } from '@nestjs/common';

import { Region } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';

@Injectable()
export class RegionRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  public async ensureByCode(
    data: { bcCode: string; name: string; safetyBuffer: number },
    tx?: TransactionClient,
  ): Promise<Pick<Region, 'id' | 'bcCode'>> {
    return this.client(tx).region.upsert({
      where: { bcCode: data.bcCode },
      create: data,
      update: {},
      select: { id: true, bcCode: true },
    });
  }

  public async findSafetyBuffer(
    regionId: string,
    tx?: TransactionClient,
  ): Promise<Pick<Region, 'safetyBuffer' | 'bcCode'>> {
    return this.client(tx).region.findUniqueOrThrow({
      where: { id: regionId },
      select: { safetyBuffer: true, bcCode: true },
    });
  }
}
