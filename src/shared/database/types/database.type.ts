import { Prisma } from '../../../generated/prisma/client';

import { DatabaseService } from '../database.service';

/**
 * The client handed to a callback inside `$transaction`. Repositories accept it
 * so a whole event can be applied atomically.
 */
export type TransactionClient = Prisma.TransactionClient;

/** Either the root client or a transaction — what repositories actually query. */
export type DatabaseClient = DatabaseService | TransactionClient;
