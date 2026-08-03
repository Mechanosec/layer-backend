import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import { setupTestDatabase } from './testcontainer.helper';

/**
 * Testcontainers speaks to the Docker API. On the dev machines there is no
 * Docker daemon — Podman serves the same socket — so point DOCKER_HOST at it
 * when it exists and nothing else claimed the variable (CI runners have real
 * Docker and need no help).
 */
const setupPodmanForTestcontainers = (): void => {
  if (process.env.DOCKER_HOST) {
    return;
  }

  const uid = execSync('id -u', { encoding: 'utf8' }).trim();
  const podmanSocket = `/run/user/${uid}/podman/podman.sock`;

  if (existsSync(podmanSocket)) {
    process.env.DOCKER_HOST = `unix://${podmanSocket}`;
    process.env.TESTCONTAINERS_RYUK_PRIVILEGED = 'true';
  }
};

export default async (): Promise<void> => {
  setupPodmanForTestcontainers();

  const { databaseUrl } = await setupTestDatabase();

  // Inherited by every Jest worker; AppConfigService reads it like any other
  // deployment would.
  process.env.DATABASE_URL = databaseUrl;
};
