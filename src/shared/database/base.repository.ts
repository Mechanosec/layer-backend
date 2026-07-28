import { DatabaseService } from './database.service';
import { DatabaseClient, TransactionClient } from './types/database.type';

/**
 * Shared plumbing for repositories: every method takes an optional transaction
 * client, so callers decide whether a query joins an in-flight transaction
 * without repositories knowing anything about transaction boundaries.
 */
export abstract class BaseRepository {
  protected constructor(protected readonly database: DatabaseService) {}

  protected client(tx?: TransactionClient): DatabaseClient {
    return tx ?? this.database;
  }
}
