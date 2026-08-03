import { cleanupTestDatabase } from './testcontainer.helper';

export default async (): Promise<void> => {
  try {
    await cleanupTestDatabase();
  } catch {
    // The container is throwaway; a failed stop only leaves it for Ryuk to reap.
  }
};
