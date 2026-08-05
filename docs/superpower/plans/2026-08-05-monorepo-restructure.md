# Monorepo Restructure Implementation Plan (phase 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert layer-backend from a single-app NestJS layout (`src/`) into a NestJS monorepo (`apps/monolith` + `libs/shared` + `libs/stock`) with zero behaviour change — every existing test stays green.

**Architecture:** This is phase 1 of the modular-monolith design
(`docs/superpower/specs/2026-08-05-modular-monolith-design.md`). It only relocates
code and rewires build/test tooling. Phase 2 (orders domain) and phase 3 (pim
domain) are separate plans written after this one lands. Today's entire service —
modules `bc-events`, `stock`, `ecom`, `health`, `pipeline` — becomes `libs/stock`
(it *is* the stock/layer domain); `src/shared` becomes `libs/shared`; the bootstrap
(`main.ts` + `app.module.ts`) becomes `apps/monolith`.

**Tech Stack:** NestJS 11 monorepo mode (webpack build), Prisma 7 (generated client
relocates to `libs/shared/src/generated/prisma`), ts-jest, pnpm.

## Global Constraints

- Zero behaviour change: no service, DTO, or schema logic edits — only moves, import rewrites, and tooling config.
- Path aliases exist **only** at lib boundaries: `@libs/shared/*` and `@libs/stock/*`. Inside a lib, imports stay deep-relative. No barrel files.
- Use `git mv` for all moves so history follows the files.
- Prisma client output moves to `libs/shared/src/generated/prisma` and stays gitignored; regenerate with `pnpm db:generate` after the schema edit.
- The webpack monorepo build must emit exactly `dist/apps/monolith/main.js`; `start:prod` is `node dist/apps/monolith/main`.
- All existing suites must pass unchanged in intent: `pnpm test`, `pnpm test:e2e`, `pnpm test:integration` (integration needs the podman socket exported: `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock`).
- Every command below runs from the repo root `/home/mechanosec/PetWork/Shop/layer-backend`.

---

### Task 1: Move to the monorepo layout and get build + unit tests green

**Files:**
- Modify: `nest-cli.json`, `tsconfig.json`, `package.json` (scripts + jest block), `prisma/schema.prisma:11-18`, `prisma/seed.ts:4`, `.gitignore:57`, `.prettierignore:3`, `eslint.config.mjs:10`
- Create: `apps/monolith/tsconfig.app.json`
- Delete: `tsconfig.build.json`
- Move: `src/shared/**` → `libs/shared/src/**`; `src/modules/{bc-events,stock,ecom,health,pipeline}/**` → `libs/stock/src/**`; `src/modules/app.module.ts` → `apps/monolith/src/app.module.ts`; `src/main.ts` → `apps/monolith/src/main.ts`
- Test: existing unit suites (`pnpm test`), no new tests — this is a pure refactor

**Interfaces:**
- Consumes: nothing — first task.
- Produces: the layout and aliases every later task and phase relies on: `@libs/shared/<path>` ↔ `libs/shared/src/<path>`, `@libs/stock/<module>/<path>` ↔ `libs/stock/src/<module>/<path>`, entry `apps/monolith/src/main.ts`, build artefact `dist/apps/monolith/main.js`.

- [ ] **Step 1: Move the source trees with git mv**

```bash
mkdir -p apps/monolith/src libs/shared libs/stock/src
git mv src/shared libs/shared/src
git mv src/modules/bc-events libs/stock/src/bc-events
git mv src/modules/stock    libs/stock/src/stock
git mv src/modules/ecom     libs/stock/src/ecom
git mv src/modules/health   libs/stock/src/health
git mv src/modules/pipeline libs/stock/src/pipeline
git mv src/modules/app.module.ts apps/monolith/src/app.module.ts
git mv src/main.ts apps/monolith/src/main.ts
```

`src/` now contains only the gitignored `generated/` — remove it after Step 3 regenerates the client elsewhere.

- [ ] **Step 2: Switch nest-cli.json to monorepo mode**

Replace the whole file with:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "monorepo": true,
  "root": "apps/monolith",
  "sourceRoot": "apps/monolith/src",
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": true,
    "tsConfigPath": "apps/monolith/tsconfig.app.json"
  },
  "projects": {
    "monolith": {
      "type": "application",
      "root": "apps/monolith",
      "entryFile": "main",
      "sourceRoot": "apps/monolith/src",
      "compilerOptions": {
        "tsConfigPath": "apps/monolith/tsconfig.app.json"
      }
    },
    "shared": {
      "type": "library",
      "root": "libs/shared",
      "sourceRoot": "libs/shared/src"
    },
    "stock": {
      "type": "library",
      "root": "libs/stock",
      "sourceRoot": "libs/stock/src"
    }
  }
}
```

Monorepo mode builds with webpack, which bundles the app **and** the libs it
imports into one `dist/apps/monolith/main.js` — this is what makes `@libs/*`
aliases work at runtime without `tsconfig-paths`. `node_modules` stay external
(nest's default webpack config), so Prisma runtime, kafkajs and pino resolve
normally.

- [ ] **Step 3: Add path aliases and per-app tsconfig; relocate the Prisma client**

In `tsconfig.json`, add inside `compilerOptions` (keep everything else as is):

```json
    "paths": {
      "@libs/shared/*": ["libs/shared/src/*"],
      "@libs/stock/*": ["libs/stock/src/*"]
    }
```

Create `apps/monolith/tsconfig.app.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "declaration": false,
    "outDir": "../../dist/apps/monolith"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*spec.ts"]
}
```

Delete `tsconfig.build.json` — both hacks it carried (`rootDir` pinned against
`prisma/seed.ts`, `tsBuildInfoFile` inside dist) are artifacts of the single-app
tsc build and are obsolete under the webpack monorepo build:

```bash
git rm tsconfig.build.json
```

In `prisma/schema.prisma` change the generator output (line 13):

```prisma
  output       = "../libs/shared/src/generated/prisma"
```

In `prisma/seed.ts` line 4:

```ts
import { PrismaClient } from '../libs/shared/src/generated/prisma/client';
```

Update ignore files — `.gitignore` line 57: `/src/generated` → `/libs/shared/src/generated`;
`.prettierignore` line 3: `src/generated` → `libs/shared/src/generated`;
`eslint.config.mjs` line 10: `'src/generated/**'` → `'libs/shared/src/generated/**'`.

Regenerate and drop the old tree:

```bash
pnpm db:generate
rm -rf src
```

- [ ] **Step 4: Rewrite imports**

Four scoped sweeps. `sed -E -i` on Linux GNU sed.

**(a) `libs/shared` — generated client is now inside the lib, one level closer** (own lib → stays relative, per the alias-only-at-boundaries rule):

```bash
grep -rl "generated/prisma" libs/shared/src --include='*.ts' | \
  xargs sed -E -i "s#from '\.\./((\.\./)*generated/prisma)#from '\1#g"
```

(strips exactly one `../` — `'../../generated/prisma'` → `'../generated/prisma'`, `'../../../...'` → `'../../...'`.)

**(b) `libs/stock` — shared and generated go through the alias; intra-lib relative imports (`stock` → `ecom` etc.) are depth-preserved by the move and need no change:**

```bash
grep -rlE "from '(\.\./)+(shared|generated)/" libs/stock/src --include='*.ts' | \
  xargs sed -E -i \
    -e "s#from '(\.\./)+shared/#from '@libs/shared/#g" \
    -e "s#from '(\.\./)+generated/prisma#from '@libs/shared/generated/prisma#g"
```

**(c) `apps/monolith`:**

```bash
sed -E -i \
  -e "s#from '\.\./shared/#from '@libs/shared/#g" \
  -e "s#from '\./(bc-events|stock|ecom|health|pipeline)/#from '@libs/stock/\1/#g" \
  apps/monolith/src/app.module.ts
sed -E -i \
  -e "s#from '\./modules/app.module'#from './app.module'#" \
  -e "s#from '\./shared/#from '@libs/shared/#g" \
  apps/monolith/src/main.ts
```

**(d) `test/`:**

```bash
sed -E -i \
  -e "s#from '\.\./src/shared/#from '@libs/shared/#g" \
  -e "s#from '\.\./src/modules/#from '@libs/stock/#g" \
  -e "s#from '\.\./src/generated/prisma#from '@libs/shared/generated/prisma#g" \
  test/*.ts
```

Then verify nothing still points at the old world:

```bash
grep -rn "\.\./src/\|'\.\./shared\|\.\./\.\./shared\|src/modules\|src/generated" \
  apps libs test --include='*.ts' | grep -v generated/prisma/ || echo CLEAN
```

Expected: `CLEAN` (generated client internals are allowed to keep their own relative imports).

- [ ] **Step 5: Update package.json scripts and the unit jest block**

Scripts — change only these entries:

```json
    "start:prod": "node dist/apps/monolith/main",
    "format": "prettier --write \"apps/**/*.ts\" \"libs/**/*.ts\" \"test/**/*.ts\"",
    "lint": "eslint \"{apps,libs,test}/**/*.ts\" --fix",
```

(`build`, `start`, `start:dev` stay as they are — in monorepo mode `nest build` /
`nest start` default to the `monolith` project via `root` in nest-cli.json.)

Replace the whole `"jest"` block with:

```json
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": ".",
    "roots": ["<rootDir>/apps", "<rootDir>/libs"],
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "moduleNameMapper": {
      "^@libs/shared/(.*)$": "<rootDir>/libs/shared/src/$1",
      "^@libs/stock/(.*)$": "<rootDir>/libs/stock/src/$1",
      "^(\\.{1,2}/.*)\\.js$": "$1"
    },
    "collectCoverageFrom": ["apps/**/*.(t|j)s", "libs/**/*.(t|j)s"],
    "coveragePathIgnorePatterns": ["/generated/"],
    "testPathIgnorePatterns": ["/generated/", "/node_modules/", "/dist/"],
    "coverageDirectory": "coverage",
    "testEnvironment": "node"
  }
```

(The `\\.js$` mapper must stay — the generated Prisma client imports `.js`
specifiers that point at `.ts` files.)

- [ ] **Step 6: Build and run unit tests**

```bash
pnpm build && ls dist/apps/monolith/main.js
pnpm test
pnpm lint
```

Expected: build emits `dist/apps/monolith/main.js`; all existing unit suites pass
(bc-events ×2, stock ×5, ecom-api, utils); lint clean. Fix any residual import
misses the greps did not catch (compiler output names them) before moving on.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: restructure into a NestJS monorepo (apps/monolith + libs/shared + libs/stock)"
```

---

### Task 2: E2e, integration and runtime verification

**Files:**
- Modify: `test/jest-e2e.json`, `test/jest-integration.json`

**Interfaces:**
- Consumes: layout and aliases from Task 1.
- Produces: green `pnpm test:e2e` and `pnpm test:integration`; a proven `pnpm start:prod` boot path used by Task 3's deploy notes.

- [ ] **Step 1: Add the alias mappers to both test configs**

In `test/jest-e2e.json` and `test/jest-integration.json`, replace `moduleNameMapper` with (note `<rootDir>` here is `test/`):

```json
  "moduleNameMapper": {
    "^@libs/shared/(.*)$": "<rootDir>/../libs/shared/src/$1",
    "^@libs/stock/(.*)$": "<rootDir>/../libs/stock/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
```

- [ ] **Step 2: Run the e2e suite**

```bash
pnpm test:e2e
```

Expected: `health.e2e-spec.ts` passes.

- [ ] **Step 3: Run the integration suite (Testcontainers over podman)**

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
pnpm test:integration
```

Expected: `stock-flow.integration-spec.ts` passes. (Its helper shells out to
prisma CLI — unaffected: `prisma.config.ts` paths did not move.)

- [ ] **Step 4: Boot the built bundle against the local stand**

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm mock:ecom &   # calculation needs it to publish
pnpm start:prod &
sleep 5 && curl -sf http://localhost:3000/health && echo OK
kill %1 %2
```

Expected: `OK`. This proves the webpack bundle resolves Prisma's driver adapter,
kafkajs and the pino transport at runtime — the three most likely bundling
casualties. If the bundle fails on a dynamic require, the fix is to add that
package to `externals` via a `webpack.config.js` override — but with nest's
default node-externals this is not expected.

- [ ] **Step 5: Commit**

```bash
git add test/jest-e2e.json test/jest-integration.json
git commit -m "test: point e2e and integration configs at the monorepo aliases"
```

---

### Task 3: CI and deploy path

**Files:**
- Modify: `.github/workflows/ci.yml` (only if the checks below demand it), server systemd unit (manual, out-of-repo)

**Interfaces:**
- Consumes: `dist/apps/monolith/main.js` artefact path from Task 1.
- Produces: a deployable main branch; documented server-side follow-up.

- [ ] **Step 1: Audit ci.yml against the new layout**

```bash
grep -n "src/\|dist/\|pnpm build\|pnpm test" .github/workflows/ci.yml
```

The hosted jobs run `pnpm build` / `pnpm test` / lint — those keep working
untouched. The deploy job rsyncs the checkout and restarts `layer-backend` via
systemd. Confirm nothing in the workflow references `dist/main` or `src/`; if it
does, update those lines to `dist/apps/monolith/main` / the new dirs.

- [ ] **Step 2: Flag the server-side systemd unit (manual step — do not skip the check)**

The unit file lives on the server (`grazuekomapp01`, VPN-only), not in the repo.
Whoever deploys phase 1 must first run on the server:

```bash
systemctl cat layer-backend | grep ExecStart
```

If `ExecStart` invokes `node .../dist/main.js` directly, change it to
`node /opt/layer-backend/dist/apps/monolith/main.js` (via
`sudo systemctl edit layer-backend`, then `sudo systemctl daemon-reload`). If it
runs `pnpm start:prod`, nothing to do — Task 1 already fixed the script. Record
the outcome in the PR description.

- [ ] **Step 3: Sanity-run the demo stand end to end**

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
./start-demo.sh --no-open
```

Expected: stand boots (it uses `pnpm start`, which nest resolves to the monolith
project); Ctrl+C stops it. This covers `start-demo.sh`'s implicit assumptions
about the repo layout.

- [ ] **Step 4: Commit (if ci.yml changed)**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: adjust paths for the monorepo layout"
```

---

### Task 4: Documentation sweep

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/modules/*.md`, `docs/superpower/*.md`, `prisma/schema.prisma` (comments only)

**Interfaces:**
- Consumes: final layout from Tasks 1–3.
- Produces: docs that match the tree, so phase-2/3 plans can cite correct paths.

- [ ] **Step 1: Find every stale path reference**

```bash
grep -rn "src/modules\|src/shared\|src/generated\|tsconfig.build" \
  CLAUDE.md README.md docs prisma/schema.prisma | grep -v plans/ | grep -v specs/
```

- [ ] **Step 2: Update them**

Mapping: `src/shared/X` → `libs/shared/src/X`; `src/modules/X` → `libs/stock/src/X`;
`src/generated/prisma` → `libs/shared/src/generated/prisma`; `src/main.ts` →
`apps/monolith/src/main.ts`. In `CLAUDE.md` also rewrite the **Architecture**
section's opening: the two top-level trees are now `libs/stock/src` (business
logic — today's five modules) and `libs/shared/src` (integrations), bootstrapped
by `apps/monolith`; aliases `@libs/shared/*` and `@libs/stock/*` are allowed at
lib boundaries only, deep-relative imports remain the rule inside a lib. Remove
the `tsconfig.build.json` bullet from "Things that will bite you" and note
instead that the monorepo build is webpack and emits
`dist/apps/monolith/main.js`. Keep every other convention statement intact.

- [ ] **Step 3: Re-run the grep — expect only spec/plan history hits — then commit**

```bash
git add -A
git commit -m "docs: update paths for the monorepo layout"
```
