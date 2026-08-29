# AGENT.md — `@votedforus/votes`

Guidance for AI coding agents working in this repository. Prefer **source and this file** over README when they disagree (especially CLI commands and flags).

## Purpose

TypeScript **library + CLI** for fetching and analyzing U.S. Congressional floor votes (House + Senate) via the [Congress.gov API](https://api.congress.gov), with caching, legislator merge, and site-oriented JSON generation.

| Field | Value |
|-------|--------|
| Package | `@votedforus/votes` |
| CLI bin | `vfu` → `dist/src/cli/index.js` |
| Module | ESM (`"type": "module"`) |
| Entry | `exports["."]` → `./dist/index.js` + types |
| Types subpath | `@votedforus/votes/types` → `./dist/src/types.js` |
| Publish | GitHub Packages (`https://npm.pkg.github.com`) |
| Node | **24** (`.nvmrc`); `engines.node` `>=24.0.0` |

Primary consumer: `@votedforus/site` (data generation + runtime helpers/types).

## Runtime / auth

- `CONGRESS_API_KEY` **required** for live API calls (https://api.congress.gov/sign-up/).
- CLI loads `.env` from cwd and parents (up to 3 levels) via `dotenv`.
- Default Congress term: **119**.
- Install/publish auth: `.npmrc` scopes `@votedforus` (and `@scottnath` for `@votedforus/common` / `@scottnath/devx`).

```bash
nvm use
npm install
npm run build   # tsc → dist/
```

## Public library API

Barrel: repo-root `index.ts` → published `@votedforus/votes`.

### Classes

| Class | Path | Role |
|-------|------|------|
| `CongressApi` | `src/congress/congress-api.ts` | Bills, actions, recorded votes (extends `Legislators`) |
| `Legislators` | `src/legislators/legislators.ts` | Merge + query legislators |
| `XmlUtils` / `YamlUtils` | `src/utils/` | Cached download + parse for Senate XML / legislator YAML |

Hierarchy: `AbstractCongressApi` → `Legislators` → `CongressApi`.

### Key `CongressApi` methods / helpers

| Symbol | Role |
|--------|------|
| `getBill` / `getBills` / `getBillsWithVotes` | Fetch bills; expand actions/votes |
| `populateRecordedVotes` | Attach House/Senate member votes; synthesize UC/voice; assign stable vote `id`s |
| `normalizeVoteResult` | → `"passed" \| "rejected"` |
| `getBillState` / `isBillRejectedOrDead` / `isVotePassed` | Bill/vote outcome helpers |
| `shouldKeepAction` / `computeBillDateFields` | Action filtering / date fields |

### Key `Legislators` methods

`getAllLegislators`, `getLegislator`, `getLegislatorsByChamber` / `ByParty` / `ByState`, merge helpers, chamber party lists, `clearLegislatorsCache`.

### Types

- Main package re-exports a **subset** of types.
- Site and full consumers often need **`@votedforus/votes/types`** (`src/types.ts` re-exports API + domain + legislator types).
- Domain vote shape: `RecordedVoteWithVotes` adds `id?`, `votes?`, `result?`, etc. on top of API `RecordedVote`.

**Vote `id` format:** `{congress}-{BILLTYPE}-{billNumber}-{n}` with **oldest recorded vote = 1**. Changing sort/filter breaks site URLs.

### Zod

- `npm run build:typesfile` — bundle d.ts + `vfu types`
- `npm run build:schema` — `ts-to-zod` → schema file used by site (`types.zod.ts` on the site side)

## Domain: what counts as a “recorded vote”

Implemented in `CongressApi` / related helpers (broader than roll-call only):

1. API `recordedVotes[]` (roll calls)
2. Synthetic Senate **unanimous consent** passes
3. House “on passage … without objection” style cases (as coded)
4. Floor **voice votes**, excluding actions that demand yeas/nays or a recorded vote

Synthetic votes use `rollNumber: 0`, empty `url`, `recordType` `"unanimous-consent"` or `"voice"`, empty `votes`, and `membersAtAction` (ids only). They do not invent per-member casts.

Also: `shouldKeepAction` drops most Library of Congress actions except President / BecameLaw.

## CLI (`vfu`)

Entry: `src/cli/index.ts`. Local helper: `src/cli/vfu.js` (tsx). Trust **`--help`** over README.

| Command | Purpose | Important flags |
|---------|---------|-----------------|
| `legislators` | One `{bioguide}.json` per legislator | `-o`, `-t/--congress`, `-s/--small`, `-i/--images <dir>` |
| `legislators-build-from-cache` | Per-legislator JSON from cached array; **no API** | `-c/--cache`, `-o`, `-s` |
| `bills` | Fetch bills → one JSON file | `-o`, `-t`, `-b`, `--skip-cache`, `-s`, `-a` (`all`\|`votes`\|`none`), `-v` (`all`\|`only`\|`none`), `-l` |
| `voted-bills` | Bills-with-votes for **one** type → `{out}/bills/{term}/{type}/{n}.json` | **`-b` required**, `-o`, `-t`, `-s` / `--no-small`, `-l` |
| `voted-bills-sync` | Same for **all** bill types | `-o`, `-t`, `-s` / `--no-small`, `-l` |
| `bill` | Fetch **one** bill (refresh cache); optional write | **`-b`**, **`-n`**, `-t`, `-o`, `-c`, `-s` / `--no-small` |
| `build-from-cache` | Build bill JSON from API cache only | **`-o` required**, `-b` (omit = all), `-c`, `-t`, `-s` / `--no-small` |
| `generate-change-summary` | Changelog entry + PR body from data/ git changes | `--data-dir`, `--changelog-dir`, `--pr-body`, … |
| `types` | Strip module wrappers from `.d.ts` | `-i`, `-o` |

**Not in CLI:** dry-run flags. Use `-l/--limit` for small test runs. Writes are real.

**Site-oriented defaults:** `voted-bills` / sync often use `--small` (reduced payloads). Use `--no-small` for full objects.

Output layout for voted-bills paths:

```
{outputDir}/bills/{term}/{lowercaseType}/{number}.json
{outputDir}/legislators/{BIOGUIDE}.json   # legislators command
```

## Module map

| Area | Path | Role |
|------|------|------|
| Low-level API | `src/api-congress-gov/` | `AbstractCongressApi`, pagination, House vote endpoints, types + `BILL_TYPES` |
| Domain API | `src/congress/` | Bills + recorded votes, Senate XML votes, UC/VV synthesis, bill state |
| Legislators | `src/legislators/` | Merge Congress `/member` + YAML social/current + Senate CVC XML |
| Cache / fetch | `src/utils/fetchUtils.ts`, `cache-config.ts` | Permanent file cache under `.cache/` |
| CLI | `src/cli/` | Commands above |
| Types barrel | `src/types.ts` | Full re-export for `/types` |

**Senate votes** come from senate.gov LIS **XML** (via `XmlUtils`), not Congress.gov house-vote-style list endpoints.

## Caching invariants

1. Cache is **permanent** (no TTL). Clear by deleting `.cache/` or explicit clear helpers.
2. `skipCache` — no read/write. `forceRefresh` — skip read, still write (incremental list updates).
3. Incremental bill/legislator updates compare against **prior `.cache/congress` lists**, not the site’s git JSON.
4. `build-from-cache` can remove stale output files so disk matches cache.
5. Legislator images (`vfu legislators --images`): skip GET when the JPG exists **and** `.cache/congress/memberImageDates-{congress}.json` matches `memberUpdateDates-{congress}.json`. Re-download when the member list `updateDate` changes (portraits have no API date of their own).

## Testing

- Native **Node test runner** + `node:assert` + `--import tsx` + optional `--experimental-test-coverage`.
- Colocated `*.test.ts`.
- `src/test-setup.ts` — sets dummy `CONGRESS_API_KEY` for tests.
- Mocks: `fetch-mock`, `mock-fs`, and project mocks under `src/**/mocks/` (`MockCongressApi`, `MockYamlUtils`, etc.). Prefer constructor DI (`fetch`, `cacheDir`, utils) over live API.
- Scripts: `test`, `test:coverage`, `test:types`, `test:types:test`, suite filters (`test:cli`, `test:congress`, …).
- tsconfigs: `tsconfig.json` (lib), `tsconfig.test.json` (tests).

```bash
npm test
npm run test:types
npm run test:types:test
```

## Build / release

| Step | Command / config |
|------|------------------|
| Build | `npm run build` (`tsc`) |
| Types + Zod | `build:typesfile`, `build:schema` |
| Release | `release.config.mjs` → `extends: '@votedforus/common/npm'` |
| CI | `.github/workflows/ci.yml` |
| Release on `main` | `.github/workflows/release.yml` → semantic-release → GitHub Packages |

Commits: **Gitmoji** (see `.cursor/rules/gitmoji-commits.mdc`). Version bumps driven by emoji → semver via `@votedforus/common`.

## How the site uses this package

| Use | How |
|-----|-----|
| Data gen | `vfu legislators`, `voted-bills-sync`, `build-from-cache`, `generate-change-summary` |
| Runtime values | e.g. `isVotePassed`, `getBillState` from `@votedforus/votes` |
| Types / constants | `BILL_TYPES`, bill/vote types from `@votedforus/votes/types` |
| Validation | Site Zod schemas derived from votes types |

## Agent pitfalls

1. Trust **`src/cli/index.ts` / `--help`** over README for CLI surface.
2. Many symbols needed by the site are only on **`@votedforus/votes/types`**, not the main export.
3. **Stable vote IDs** — do not change oldest-first indexing casually.
4. No CLI dry-run — use `--limit` for safe experiments.
5. `voted-bills` defaults to **small** payloads (`--no-small` when full needed).
6. `bills --include-votes only` applies limit **after** filtering; initial fetch may be larger.
7. `reduceBill` / small transforms may **mutate** objects in place.
8. Do not assume cache expiry.
9. Confirm with the human before large refactors; prefer multiple-choice questions.
10. Node 24 + native tests + JSDoc on touched functions (project rules).

## Related packages

| Package | Role |
|---------|------|
| `@votedforus/site` | Astro consumer; generates `src/data/` via `vfu` |
| `@votedforus/common` | Shared semantic-release / gitmoji presets + `@scottnath/devx` |
