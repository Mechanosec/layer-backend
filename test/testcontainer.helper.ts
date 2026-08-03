import { execSync } from 'node:child_process';

import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

export interface TestDatabaseInstance {
  container: StartedPostgreSqlContainer;
  databaseUrl: string;
}

/**
 * Starts one throwaway Postgres for the whole integration run, migrates it and
 * seeds the reference data (regions/shops), exactly the way a real deployment
 * is prepared. The singleton keeps parallel calls from racing a second
 * container into existence.
 */
class TestContainerManager {
  private static instance: TestContainerManager;
  private container: StartedPostgreSqlContainer | null = null;
  private databaseUrl: string | null = null;
  private initializationPromise: Promise<TestDatabaseInstance> | null = null;

  public static getInstance(): TestContainerManager {
    if (!TestContainerManager.instance) {
      TestContainerManager.instance = new TestContainerManager();
    }

    return TestContainerManager.instance;
  }

  public async getOrCreateTestDatabase(): Promise<TestDatabaseInstance> {
    if (this.container && this.databaseUrl) {
      return { container: this.container, databaseUrl: this.databaseUrl };
    }

    this.initializationPromise ??= this.initializeTestDatabase();

    return this.initializationPromise;
  }

  private async initializeTestDatabase(): Promise<TestDatabaseInstance> {
    try {
      const container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('layer_test')
        .start();
      const databaseUrl = container.getConnectionUri();

      // The same commands a deployment runs, against the throwaway database.
      const env = { ...process.env, DATABASE_URL: databaseUrl };
      execSync('npx prisma migrate deploy', { env, stdio: 'inherit' });
      execSync('npx prisma db seed', { env, stdio: 'inherit' });

      this.container = container;
      this.databaseUrl = databaseUrl;

      return { container, databaseUrl };
    } catch (error) {
      this.initializationPromise = null;
      throw new Error(
        'Could not start the Postgres testcontainer. Is the Docker daemon ' +
          'running (or the Podman socket exported as DOCKER_HOST)?\n\n' +
          `Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async cleanup(): Promise<void> {
    if (this.container) {
      await this.container.stop();
      this.container = null;
      this.databaseUrl = null;
      this.initializationPromise = null;
    }
  }
}

export const setupTestDatabase = (): Promise<TestDatabaseInstance> =>
  TestContainerManager.getInstance().getOrCreateTestDatabase();

export const cleanupTestDatabase = (): Promise<void> =>
  TestContainerManager.getInstance().cleanup();
