import { Injectable } from '@nestjs/common';

import { Season } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';

@Injectable()
export class SeasonRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  /**
   * Seasons are shared by many products and identified by name, so the dates are
   * refreshed on every message rather than duplicated per product.
   */
  public async ensureByName(
    data: { name: string; startsAt?: Date; endsAt?: Date },
    tx?: TransactionClient,
  ): Promise<Pick<Season, 'id' | 'name'>> {
    return this.client(tx).season.upsert({
      where: { name: data.name },
      create: data,
      update: { startsAt: data.startsAt, endsAt: data.endsAt },
      select: { id: true, name: true },
    });
  }
}
