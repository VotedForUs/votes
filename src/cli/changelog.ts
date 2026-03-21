/**
 * Changelog generation for data-update workflows.
 *
 * Reads git diffs under the data directory, builds a {@link ChangelogEntry} with legislator/bill
 * **IDs only**, writes `changelog/{date}-{runId}.json`, optionally prepends a legacy accumulated
 * JSON array, and emits PR/step summary markdown by resolving titles from on-disk JSON.
 *
 * Side effects (`fs`, `git`) are injectable for tests via options or parameters.
 */

import { execSync } from 'node:child_process';
import * as defaultFs from 'node:fs';
import * as path from 'node:path';
import type {
  ChangelogEntry,
  RawChange,
  GenerateChangeSummaryOptions,
  BuildMarkdownOptions,
} from './changelog.types.js';

export type { ChangelogEntry, RawChange, GenerateChangeSummaryOptions, BuildMarkdownOptions };

const DEFAULT_SITE_BASE_URL = 'https://votedfor.us';

/**
 * Parse a canonical bill id string into path segments for `data/bills/{congress}/{type}/{number}.json`.
 *
 * @param billId - Form `{congress}-{TYPE}-{number}` (e.g. `119-HR-42`, `119-hconres-14`).
 * @returns Parsed parts or `null` if the string does not match.
 */
export function parseBillId(
  billId: string,
): { congress: number; billTypeLower: string; number: string } | null {
  const m = billId.match(/^(\d+)-([A-Za-z]+)-(.+)$/);
  if (!m) return null;
  const congress = parseInt(m[1]!, 10);
  if (Number.isNaN(congress)) return null;
  return { congress, billTypeLower: m[2]!.toLowerCase(), number: m[3]! };
}

// ===== GIT UTILITIES =====

/**
 * Run a git command and return trimmed stdout; empty string on failure (e.g. missing repo).
 *
 * @param cmd - Full git invocation (e.g. `git show HEAD:path`).
 * @param cwd - Working directory for the subprocess.
 */
export function defaultRunGit(cmd: string, cwd: string = process.cwd()): string {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd }).trim();
  } catch {
    return '';
  }
}

// ===== PATH PARSERS =====

/** Segments from a repo-relative bill JSON path under `dataPrefix/bills/`. */
interface BillPathInfo {
  congress: number;
  billType: string;
  number: string;
}

/**
 * Parse `{dataPrefix}/bills/{congress}/{billType}/{number}.json` from a repo-relative path.
 *
 * @param repoRelativePath - Path as reported by git (forward slashes).
 * @param dataPrefix - Root data folder relative to repo root (e.g. `data` or `src/data`).
 */
export function parseBillPath(repoRelativePath: string, dataPrefix = 'data'): BillPathInfo | null {
  const prefixParts = dataPrefix.replace(/\\/g, '/').split('/').filter(Boolean);
  const parts = repoRelativePath.replace(/\\/g, '/').split('/');
  const expectedLength = prefixParts.length + 4;
  if (parts.length < expectedLength) return null;
  for (let i = 0; i < prefixParts.length; i++) {
    if (parts[i] !== prefixParts[i]) return null;
  }
  const offset = prefixParts.length;
  if (parts[offset] !== 'bills') return null;
  const congress = parseInt(parts[offset + 1]!, 10);
  const billType = parts[offset + 2]!;
  const filename = parts[offset + 3]!;
  if (!filename.endsWith('.json')) return null;
  const number = path.basename(filename, '.json');
  if (isNaN(congress)) return null;
  return { congress, billType, number };
}

/**
 * Parse `{dataPrefix}/legislators/{bioguideId}.json` and return the bioguide id (filename stem).
 */
export function parseLegislatorPath(repoRelativePath: string, dataPrefix = 'data'): string | null {
  const prefixParts = dataPrefix.replace(/\\/g, '/').split('/').filter(Boolean);
  const parts = repoRelativePath.replace(/\\/g, '/').split('/');
  const expectedLength = prefixParts.length + 2;
  if (parts.length < expectedLength) return null;
  for (let i = 0; i < prefixParts.length; i++) {
    if (parts[i] !== prefixParts[i]) return null;
  }
  const offset = prefixParts.length;
  if (parts[offset] !== 'legislators') return null;
  const filename = parts[offset + 1]!;
  if (!filename.endsWith('.json')) return null;
  return path.basename(filename, '.json');
}

/**
 * Whether the path is under `{dataPrefix}/changelog/` (per-run JSON lives here; excluded from diff aggregation).
 */
export function isChangelogPath(repoRelativePath: string, dataPrefix = 'data'): boolean {
  const prefix = dataPrefix.replace(/\\/g, '/').replace(/\/$/, '');
  return repoRelativePath.startsWith(`${prefix}/changelog/`);
}

// ===== RAW CHANGE COLLECTION =====

/**
 * List added/modified/deleted paths under the data tree from git (diff HEAD, then staged, then porcelain).
 * Omits paths under `{dataPrefix}/changelog/` so new changelog files do not feed into the next summary.
 *
 * @param runGit - Injected runner; default uses {@link defaultRunGit} with `cwd`.
 * @param cwd - Repo root for git commands when using the default runner.
 * @param dataPrefix - Same prefix as {@link parseBillPath} / {@link parseLegislatorPath}.
 */
export function collectRawChanges(
  runGit: (cmd: string) => string = (cmd) => defaultRunGit(cmd),
  cwd: string = process.cwd(),
  dataPrefix = 'data',
): RawChange[] {
  const relDataDir = dataPrefix.replace(/\\/g, '/').replace(/\/$/, '');

  let diffOutput = runGit(`git diff HEAD --name-status -- ${relDataDir}/`);
  if (!diffOutput) {
    diffOutput = runGit(`git diff --cached --name-status -- ${relDataDir}/`);
  }
  if (!diffOutput) {
    const porcelain = runGit(`git status --porcelain -- ${relDataDir}/`);
    diffOutput = porcelain
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const code = line.slice(0, 2).trim();
        const file = line.slice(3).trim();
        const status: 'A' | 'M' | 'D' =
          code.includes('A') || code === '??' ? 'A' : code.includes('D') ? 'D' : 'M';
        return `${status}\t${file}`;
      })
      .join('\n');
  }

  return diffOutput
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const parts = line.trim().split(/\s+/);
      const rawStatus = parts[0]?.charAt(0) ?? 'M';
      const status: 'A' | 'M' | 'D' =
        rawStatus === 'A' ? 'A' : rawStatus === 'D' ? 'D' : 'M';
      const repoRelativePath = (parts[1] ?? '').replace(/\\/g, '/');
      return { status, repoRelativePath };
    })
    .filter(c => c.repoRelativePath.length > 0 && !isChangelogPath(c.repoRelativePath, dataPrefix));
}

// ===== DATA EXTRACTION HELPERS =====

type LegislatorJson = {
  bioguideId?: string;
  nameTitle?: string;
  bioguide?: string;
  state?: string;
  party?: string;
  latest_term?: { type?: string; state?: string; party?: string; district?: number };
  name?: { official_full?: string };
};

/**
 * Human-readable legislator label for markdown: prefers `nameTitle`, else builds from name + latest term.
 */
export function computeNameTitle(data: LegislatorJson): string {
  if (data.nameTitle) return data.nameTitle;
  const fullName = data.name?.official_full ?? '';
  const term = data.latest_term;
  if (!fullName || !term) return data.bioguideId ?? data.bioguide ?? 'Unknown';
  if (term.type === 'sen') {
    return `Sen. ${fullName} (${term.state ?? ''})`;
  }
  return `Rep. ${fullName} (${term.state ?? ''}-${term.district ?? ''})`;
}

type BillJson = {
  id?: string;
  number?: string | number;
  type?: string;
  congress?: number;
  title?: string;
  titles?: { titles?: Array<{ title?: string; titleType?: string }> };
  laws?: Array<unknown>;
  actions?: {
    actions?: Array<{
      recordedVotes?: Array<unknown>;
      type?: string;
    }>;
  };
};

/** Prefer Congress.gov short title when present, else `title`, else `"Unknown"`. */
export function getBillTitle(data: BillJson): string {
  const shortTitle = data.titles?.titles?.find(t => t.titleType?.startsWith('Short Title'))?.title;
  return shortTitle ?? data.title ?? 'Unknown';
}

/** Total count of `recordedVotes` entries across all actions. */
export function countRecordedVotes(data: BillJson): number {
  let count = 0;
  for (const action of data.actions?.actions ?? []) {
    if (Array.isArray(action.recordedVotes)) count += action.recordedVotes.length;
  }
  return count;
}

/** True if the bill has a non-empty `laws` array (enacted). */
export function hasLaws(data: BillJson): boolean {
  return Array.isArray(data.laws) && data.laws.length > 0;
}

/** Canonical bill id: `data.id` or `{congress}-{TYPE_UPPER}-{number}`. */
function billIdFromPathInfo(info: BillPathInfo, data: BillJson): string {
  return data.id ?? `${info.congress}-${info.billType.toUpperCase()}-${info.number}`;
}

// ===== CHANGELOG ENTRY BUILDER =====

/**
 * Turn raw git file changes into a {@link ChangelogEntry} (IDs only).
 *
 * @param changes - From {@link collectRawChanges}.
 * @param readNewFile - Read working-tree file at absolute path (for `A` / `M`).
 * @param readOldGitFile - Read `HEAD` blob for deleted or old bill JSON (`D` / diff for bills).
 * @param today - ISO date `YYYY-MM-DD` for the entry.
 * @param runId - Run identifier (e.g. `GITHUB_RUN_ID`).
 * @param cwd - Repo root; joined with `repoRelativePath` for `readNewFile`.
 * @param _siteBaseUrl - Reserved for future use (URLs are not stored in the entry).
 * @param dataPrefix - Data directory prefix relative to repo root.
 */
export function buildChangelogEntry(
  changes: RawChange[],
  readNewFile: (absPath: string) => string | null,
  readOldGitFile: (repoRelPath: string) => string | null,
  today: string,
  runId: string,
  cwd: string = process.cwd(),
  _siteBaseUrl: string = DEFAULT_SITE_BASE_URL,
  dataPrefix = 'data',
): ChangelogEntry {
  const entry: ChangelogEntry = {
    date: today,
    runId,
    legislators: { added: [], updated: [], removed: [] },
    bills: { added: [], updated: [], newLaws: [], withNewVotes: [] },
  };

  for (const change of changes) {
    const { status, repoRelativePath } = change;
    const absPath = path.join(cwd, repoRelativePath);

    const bioguideId = parseLegislatorPath(repoRelativePath, dataPrefix);
    if (bioguideId) {
      if (status === 'D') {
        const raw = readOldGitFile(repoRelativePath);
        if (raw) {
          const data = safeParseJson<LegislatorJson>(raw);
          if (data) {
            const id = data.bioguideId ?? data.bioguide ?? bioguideId;
            entry.legislators.removed.push(id);
          }
        }
      } else {
        const raw = readNewFile(absPath);
        if (raw) {
          const data = safeParseJson<LegislatorJson>(raw);
          if (data) {
            const id = data.bioguideId ?? data.bioguide ?? bioguideId;
            if (status === 'A') {
              entry.legislators.added.push(id);
            } else {
              entry.legislators.updated.push(id);
            }
          }
        }
      }
      continue;
    }

    const billInfo = parseBillPath(repoRelativePath, dataPrefix);
    if (billInfo) {
      if (status === 'A') {
        const raw = readNewFile(absPath);
        if (raw) {
          const data = safeParseJson<BillJson>(raw);
          if (data) entry.bills.added.push(billIdFromPathInfo(billInfo, data));
        }
      } else if (status === 'M') {
        const newRaw = readNewFile(absPath);
        if (!newRaw) continue;
        const newData = safeParseJson<BillJson>(newRaw);
        if (!newData) continue;

        const id = billIdFromPathInfo(billInfo, newData);
        entry.bills.updated.push(id);

        const oldRaw = readOldGitFile(repoRelativePath);
        const oldData = oldRaw ? safeParseJson<BillJson>(oldRaw) : null;
        const oldVoteCount = oldData ? countRecordedVotes(oldData) : 0;

        if (countRecordedVotes(newData) > oldVoteCount) {
          entry.bills.withNewVotes.push(id);
        }
        if (!hasLaws(oldData ?? {}) && hasLaws(newData)) {
          entry.bills.newLaws.push(id);
        }
      }
      continue;
    }
  }

  return entry;
}

/** Parse JSON or return `null` on failure. */
function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ===== FILE WRITERS =====

/**
 * Write one per-run changelog file: `{changelogDir}/{date}-{runId}.json`.
 *
 * @returns Absolute path written.
 */
export function writeChangelogEntry(
  entry: ChangelogEntry,
  changelogDir: string,
  fsModule: typeof defaultFs = defaultFs,
): string {
  if (!fsModule.existsSync(changelogDir)) {
    fsModule.mkdirSync(changelogDir, { recursive: true });
  }
  const filename = `${entry.date}-${entry.runId}.json`;
  const filePath = path.join(changelogDir, filename);
  fsModule.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
  return filePath;
}

/**
 * Legacy: prepend `entry` to a JSON array at `accumulatedPath`. Corrupt files are replaced with `[entry]`.
 * Prefer per-run files only; call only when `accumulatedPath` is set explicitly.
 */
export function updateAccumulatedChangelog(
  entry: ChangelogEntry,
  accumulatedPath: string,
  fsModule: typeof defaultFs = defaultFs,
): void {
  let existing: ChangelogEntry[] = [];
  if (fsModule.existsSync(accumulatedPath)) {
    try {
      const raw = fsModule.readFileSync(accumulatedPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) existing = parsed as ChangelogEntry[];
    } catch {
      existing = [];
    }
  }
  existing.unshift(entry);
  const dir = path.dirname(accumulatedPath);
  if (!fsModule.existsSync(dir)) {
    fsModule.mkdirSync(dir, { recursive: true });
  }
  fsModule.writeFileSync(accumulatedPath, JSON.stringify(existing, null, 2), 'utf8');
}

// ===== MARKDOWN BUILDER (resolves ids from dataDir) =====

const LEGISLATOR_DISPLAY_LIMIT = 30;
const BILL_DISPLAY_LIMIT = 50;

/** Markdown bullet with link for an added/updated legislator id. */
function readLegislatorLine(
  bioguideId: string,
  opts: BuildMarkdownOptions,
): { md: string } {
  const fsModule = opts.fsModule ?? defaultFs;
  const base = opts.siteBaseUrl ?? DEFAULT_SITE_BASE_URL;
  const filePath = path.join(opts.dataDir, 'legislators', `${bioguideId}.json`);
  try {
    const raw = fsModule.readFileSync(filePath, 'utf8');
    const data = safeParseJson<LegislatorJson>(raw);
    const label = data ? computeNameTitle(data) : bioguideId;
    return { md: `* [${label}](${base}/legislators/${bioguideId})` };
  } catch {
    return { md: `* [${bioguideId}](${base}/legislators/${bioguideId})` };
  }
}

/** Markdown bullet with link for a bill id, using on-disk bill JSON for title when available. */
function readBillLine(
  billId: string,
  opts: BuildMarkdownOptions,
): { md: string } {
  const fsModule = opts.fsModule ?? defaultFs;
  const base = opts.siteBaseUrl ?? DEFAULT_SITE_BASE_URL;
  const parsed = parseBillId(billId);
  if (!parsed) {
    return { md: `* ${billId}` };
  }
  const filePath = path.join(
    opts.dataDir,
    'bills',
    String(parsed.congress),
    parsed.billTypeLower,
    `${parsed.number}.json`,
  );
  try {
    const raw = fsModule.readFileSync(filePath, 'utf8');
    const data = safeParseJson<BillJson>(raw);
    const title = data ? getBillTitle(data) : billId;
    const url = `${base}/bills/${parsed.congress}/${parsed.billTypeLower}/${parsed.number}`;
    return { md: `* [${title}](${url})` };
  } catch {
    const url = `${base}/bills/${parsed.congress}/${parsed.billTypeLower}/${parsed.number}`;
    return { md: `* [${billId}](${url})` };
  }
}

/**
 * Build PR / GitHub Actions step-summary markdown from a {@link ChangelogEntry}.
 *
 * Resolves display strings from `{dataDir}/legislators/{id}.json` and bill paths under `{dataDir}/bills/`.
 * Removed legislators render as plain text (no link). Long updated lists are truncated with an overflow line.
 *
 * @param entry - ID-only changelog payload.
 * @param opts - `dataDir` required; optional `fsModule` and `siteBaseUrl` (default `https://votedfor.us`).
 */
export function buildMarkdown(entry: ChangelogEntry, opts: BuildMarkdownOptions): string {
  const { legislators, bills } = entry;
  const lines: string[] = [`## Congressional Data Update — ${entry.date}`, ''];

  if (legislators.added.length > 0) {
    lines.push(`### New Legislators (${legislators.added.length})`);
    for (const id of legislators.added) {
      lines.push(readLegislatorLine(id, opts).md);
    }
    lines.push('');
  }

  if (legislators.updated.length > 0) {
    lines.push(`### Updated Legislators (${legislators.updated.length})`);
    for (const id of legislators.updated.slice(0, LEGISLATOR_DISPLAY_LIMIT)) {
      lines.push(readLegislatorLine(id, opts).md);
    }
    if (legislators.updated.length > LEGISLATOR_DISPLAY_LIMIT) {
      lines.push(`* *(and ${legislators.updated.length - LEGISLATOR_DISPLAY_LIMIT} more)*`);
    }
    lines.push('');
  }

  if (legislators.removed.length > 0) {
    lines.push(`### Removed Legislators (${legislators.removed.length})`);
    for (const id of legislators.removed) {
      lines.push(removedLegislatorLine(id, opts));
    }
    lines.push('');
  }

  if (bills.newLaws.length > 0) {
    lines.push(`### Bills That Became Law (${bills.newLaws.length})`);
    for (const id of bills.newLaws) {
      lines.push(readBillLine(id, opts).md);
    }
    lines.push('');
  }

  if (bills.withNewVotes.length > 0) {
    lines.push(`### Bills With New Votes (${bills.withNewVotes.length})`);
    for (const id of bills.withNewVotes) {
      lines.push(readBillLine(id, opts).md);
    }
    lines.push('');
  }

  if (bills.added.length > 0) {
    lines.push(`### Newly Voted-on Bills (${bills.added.length})`);
    for (const id of bills.added) {
      lines.push(readBillLine(id, opts).md);
    }
    lines.push('');
  }

  if (bills.updated.length > 0) {
    lines.push(`### Updated Bills (${bills.updated.length})`);
    for (const id of bills.updated.slice(0, BILL_DISPLAY_LIMIT)) {
      lines.push(readBillLine(id, opts).md);
    }
    if (bills.updated.length > BILL_DISPLAY_LIMIT) {
      lines.push(`* *(and ${bills.updated.length - BILL_DISPLAY_LIMIT} more)*`);
    }
    lines.push('');
  }

  const hasChanges =
    legislators.added.length > 0 ||
    legislators.updated.length > 0 ||
    legislators.removed.length > 0 ||
    bills.added.length > 0 ||
    bills.updated.length > 0 ||
    bills.newLaws.length > 0 ||
    bills.withNewVotes.length > 0;

  if (!hasChanges) {
    lines.push('_No content changes detected._');
  }

  return lines.join('\n');
}

/** Markdown bullet for a removed legislator: label from file if present, else id only. */
function removedLegislatorLine(bioguideId: string, opts: BuildMarkdownOptions): string {
  const fsModule = opts.fsModule ?? defaultFs;
  const filePath = path.join(opts.dataDir, 'legislators', `${bioguideId}.json`);
  try {
    const raw = fsModule.readFileSync(filePath, 'utf8');
    const data = safeParseJson<LegislatorJson>(raw);
    const label = data ? computeNameTitle(data) : bioguideId;
    return `* ${label} (${bioguideId})`;
  } catch {
    return `* ${bioguideId}`;
  }
}

/**
 * Write `prBodyPath` and optionally append the same markdown to the GitHub step summary file.
 *
 * @param markdown - Full PR / summary body.
 * @param prBodyPath - Destination path (parent dirs created if needed).
 * @param fsModule - Injectable `fs` (default `node:fs`).
 * @param stepSummaryPath - `null` disables step summary; `undefined` uses `GITHUB_STEP_SUMMARY` when set.
 */
export function writePrBody(
  markdown: string,
  prBodyPath: string,
  fsModule: typeof defaultFs = defaultFs,
  stepSummaryPath?: string | null,
): void {
  const dir = path.dirname(prBodyPath);
  if (!fsModule.existsSync(dir)) {
    fsModule.mkdirSync(dir, { recursive: true });
  }
  fsModule.writeFileSync(prBodyPath, markdown, 'utf8');

  const summaryPath = stepSummaryPath === null ? undefined : (stepSummaryPath ?? process.env['GITHUB_STEP_SUMMARY']);
  if (summaryPath) {
    fsModule.appendFileSync(summaryPath, markdown + '\n', 'utf8');
  }
}

/**
 * End-to-end: git diff → {@link ChangelogEntry} → per-run JSON → optional accumulated JSON → PR body markdown.
 *
 * @param options - See {@link GenerateChangeSummaryOptions}. Omit `accumulatedPath` to skip legacy array file.
 * @returns The in-memory entry (same shape as written to disk).
 */
export function generateChangeSummary(options: GenerateChangeSummaryOptions = {}): ChangelogEntry {
  const cwd = options.cwd ?? process.cwd();
  const fsModule = options.fsModule ?? defaultFs;
  const runGit = options.runGit ?? ((cmd: string) => defaultRunGit(cmd, cwd));

  const dataDir = options.dataDir ?? path.join(cwd, 'data');
  const dataPrefix = path.relative(cwd, dataDir).replace(/\\/g, '/') || 'data';
  const changelogDir = options.changelogDir ?? path.join(dataDir, 'changelog');
  const prBodyPath = options.prBodyPath ?? path.join(cwd, '.github', 'pr-body.md');
  const runId = options.runId ?? process.env['GITHUB_RUN_ID'] ?? String(Date.now());
  const today = options.today ?? new Date().toISOString().split('T')[0]!;
  const siteBaseUrl = options.siteBaseUrl ?? DEFAULT_SITE_BASE_URL;

  const readNewFile = (absPath: string): string | null => {
    try {
      return fsModule.readFileSync(absPath, 'utf8');
    } catch {
      return null;
    }
  };

  const readOldGitFile = (repoRelPath: string): string | null => {
    return runGit(`git show HEAD:${repoRelPath}`) || null;
  };

  const changes = collectRawChanges(runGit, cwd, dataPrefix);
  const entry = buildChangelogEntry(changes, readNewFile, readOldGitFile, today, runId, cwd, siteBaseUrl, dataPrefix);

  const writtenPath = writeChangelogEntry(entry, changelogDir, fsModule);
  console.log(`Written: ${writtenPath}`);

  if (options.accumulatedPath !== undefined && options.accumulatedPath !== '') {
    updateAccumulatedChangelog(entry, options.accumulatedPath, fsModule);
    console.log(`Updated: ${options.accumulatedPath}`);
  }

  const markdown = buildMarkdown(entry, { fsModule, dataDir, siteBaseUrl });
  writePrBody(markdown, prBodyPath, fsModule, options.stepSummaryPath);
  console.log(`Written: ${prBodyPath}`);

  console.log(
    `Legislators: +${entry.legislators.added.length} added, ~${entry.legislators.updated.length} updated, -${entry.legislators.removed.length} removed`,
  );
  console.log(
    `Bills: +${entry.bills.added.length} added, ~${entry.bills.updated.length} updated, ${entry.bills.newLaws.length} new laws, ${entry.bills.withNewVotes.length} with new votes`,
  );

  return entry;
}
