import { TransactionClient } from '../types/database.type';

/**
 * Generic building blocks for repository interfaces. A repository composes the
 * operations it actually offers, e.g.
 *
 *   interface IShopStockRepository
 *     extends RepositoryUpsert<Prisma.ShopStockUpsertArgs, ShopStock>,
 *       RepositoryAggregate<Prisma.ShopStockAggregateArgs, number> {}
 */
export interface RepositoryFindUnique<Args, Result> {
  findUnique(args: Args, tx?: TransactionClient): Promise<Result>;
}

export interface RepositoryFindMany<Args, Result> {
  findMany(args: Args, tx?: TransactionClient): Promise<Result[]>;
}

export interface RepositoryCreate<Args, Result> {
  create(args: Args, tx?: TransactionClient): Promise<Result>;
}

export interface RepositoryUpsert<Args, Result> {
  upsert(args: Args, tx?: TransactionClient): Promise<Result>;
}

export interface RepositoryUpdate<Args, Result> {
  update(args: Args, tx?: TransactionClient): Promise<Result>;
}

export interface RepositoryUpdateMany<Args> {
  updateMany(args: Args, tx?: TransactionClient): Promise<number>;
}
