/**
 * CLI module for generating structured changelog entries from data/ git changes.
 *
 * All side-effectful dependencies (fs, git) are injectable for testability.
 */

import { execSync } from 'node:child_process';
import * as defaultFs from 'node:fs';
import * as path from 'node:path';
import type {
  ChangelogEntry,
  BillChangeItem,
  LegislatorChangeItem,
  RawChange,
  GenerateChangeSummaryOptions,
} from './changelog.types.js';

export type { ChangelogEntry, BillChangeItem, LegislatorChangeItem, RawChange, GenerateChangeSummaryOptions };

const DEFAULT_SITE_BASE_URL = 'https://votedfor.us';

// ===== GIT UTILITIES =====

/** Default git runner using execSync */
export function defaultRunGit(cmd: string, cwd: string = process.cwd()): string {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd }).trim();
  } catch {
    return '';
  }
}

// ===== PATH PARSERS =====

interface BillPathInfo {
  congress: number;
  billType: string;
  number: string;
}

export function parseBillPath(repoRelativePath: string, dataPrefix = 'data'): BillPathInfo | null {
  // {dataPrefix}/bills/{congress}/{billType}/{number}.json
  const prefixParts = dataPrefix.replace(/\\/g, '/').split('/').filter(Boolean);
  const parts = repoRelativePath.replace(/\\/g, '/').split('/');
  const expectedLength = prefixParts.length + 4; // prefix + bills + congress + billType + filename
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

export function parseLegislatorPath(repoRelativePath: string, dataPrefix = 'data'): string | null {
  // {dataPrefix}/legislators/{bioguideId}.json
  const prefixParts = dataPrefix.replace(/\\/g, '/').split('/').filter(Boolean);
  const parts = repoRelativePath.replace(/\\/g, '/').split('/');
  const expectedLength = prefixParts.length + 2; // prefix + legislators + filename
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

export function isChangelogPath(repoRelativePath: string, dataPrefix = 'data'): boolean {
  const prefix = dataPrefix.replace(/\\/g, '/').replace(/\/$/, '');
  return repoRelativePath.startsWith(`${prefix}/changelog/`);
}

// ===== RAW CHANGE COLLECTION =====

/**
 * Collect git status changes in dataPrefix/ (working tree vs HEAD).
 * Excludes changelog files themselves to avoid recursion.
 *
 * @param runGit - injectable git runner (default: execSync wrapper)
 * @param cwd - working directory for git commands (default: process.cwd())
 * @param dataPrefix - repo-relative path prefix for data dir (default: 'data')
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

export function extractLegislatorItem(
  bioguideId: string,
  data: LegislatorJson,
  siteBaseUrl: string = DEFAULT_SITE_BASE_URL,
): LegislatorChangeItem {
  const id = data.bioguideId ?? data.bioguide ?? bioguideId;
  return {
    bioguideId: id,
    nameTitle: computeNameTitle(data),
    state: data.state ?? data.latest_term?.state ?? '',
    party: data.party ?? data.latest_term?.party ?? '',
    url: `${siteBaseUrl}/legislators/${id}`,
  };
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

export function getBillTitle(data: BillJson): string {
  const shortTitle = data.titles?.titles?.find(t => t.titleType?.startsWith('Short Title'))?.title;
  return shortTitle ?? data.title ?? 'Unknown';
}

export function countRecordedVotes(data: BillJson): number {
  let count = 0;
  for (const action of data.actions?.actions ?? []) {
    if (Array.isArray(action.recordedVotes)) count += action.recordedVotes.length;
  }
  return count;
}

export function hasLaws(data: BillJson): boolean {
  return Array.isArray(data.laws) && data.laws.length > 0;
}

export function extractBillItem(
  info: BillPathInfo,
  data: BillJson,
  siteBaseUrl: string = DEFAULT_SITE_BASE_URL,
): BillChangeItem {
  const id = data.id ?? `${info.congress}-${info.billType.toUpperCase()}-${info.number}`;
  return {
    id,
    title: getBillTitle(data),
    congress: info.congress,
    billType: info.billType,
    number: info.number,
    url: `${siteBaseUrl}/bills/${info.congress}/${info.billType.toLowerCase()}/${info.number}`,
  };
}

// ===== CHANGELOG ENTRY BUILDER =====

/**
 * Build a structured ChangelogEntry from raw git changes.
 *
 * @param changes - list of raw file changes
 * @param readNewFile - reads working-tree file content by absolute path; returns null on error
 * @param readOldGitFile - reads file content from git HEAD by repo-relative path; returns null on miss
 * @param today - ISO date string YYYY-MM-DD
 * @param runId - unique run identifier
 * @param cwd - repo root for resolving absolute paths
 * @param siteBaseUrl - base URL for building links
 */
export function buildChangelogEntry(
  changes: RawChange[],
  readNewFile: (absPath: string) => string | null,
  readOldGitFile: (repoRelPath: string) => string | null,
  today: string,
  runId: string,
  cwd: string = process.cwd(),
  siteBaseUrl: string = DEFAULT_SITE_BASE_URL,
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
          if (data) entry.legislators.removed.push(extractLegislatorItem(bioguideId, data, siteBaseUrl));
        }
      } else {
        const raw = readNewFile(absPath);
        if (raw) {
          const data = safeParseJson<LegislatorJson>(raw);
          if (data) {
            const item = extractLegislatorItem(bioguideId, data, siteBaseUrl);
            if (status === 'A') {
              entry.legislators.added.push(item);
            } else {
              entry.legislators.updated.push(item);
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
          if (data) entry.bills.added.push(extractBillItem(billInfo, data, siteBaseUrl));
        }
      } else if (status === 'M') {
        const newRaw = readNewFile(absPath);
        if (!newRaw) continue;
        const newData = safeParseJson<BillJson>(newRaw);
        if (!newData) continue;

        const billItem = extractBillItem(billInfo, newData, siteBaseUrl);
        entry.bills.updated.push(billItem);

        const oldRaw = readOldGitFile(repoRelativePath);
        const oldData = oldRaw ? safeParseJson<BillJson>(oldRaw) : null;
        const oldVoteCount = oldData ? countRecordedVotes(oldData) : 0;

        if (countRecordedVotes(newData) > oldVoteCount) {
          entry.bills.withNewVotes.push(billItem);
        }
        if (!hasLaws(oldData ?? {}) && hasLaws(newData)) {
          entry.bills.newLaws.push(billItem);
        }
      }
      continue;
    }
  }

  return entry;
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ===== FILE WRITERS =====

/**
 * Write a per-run changelog entry to changelogDir/{date}-{runId}.json.
 * @returns The path of the written file.
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
 * Prepend entry to the accumulated changelog.json array.
 * Creates the file if it does not yet exist.
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

// ===== MARKDOWN BUILDER =====

const LEGISLATOR_DISPLAY_LIMIT = 30;
const BILL_DISPLAY_LIMIT = 50;

/**
 * Build a rich markdown string from a ChangelogEntry.
 * Pure function — no side effects.
 */
export function buildMarkdown(entry: ChangelogEntry): string {
  const { legislators, bills } = entry;
  const lines: string[] = [`## Congressional Data Update — ${entry.date}`, ''];

  if (legislators.added.length > 0) {
    lines.push(`### New Legislators (${legislators.added.length})`);
    for (const l of legislators.added) {
      lines.push(`* [${l.nameTitle}](${l.url})`);
    }
    lines.push('');
  }

  if (legislators.updated.length > 0) {
    lines.push(`### Updated Legislators (${legislators.updated.length})`);
    for (const l of legislators.updated.slice(0, LEGISLATOR_DISPLAY_LIMIT)) {
      lines.push(`* [${l.nameTitle}](${l.url})`);
    }
    if (legislators.updated.length > LEGISLATOR_DISPLAY_LIMIT) {
      lines.push(`* *(and ${legislators.updated.length - LEGISLATOR_DISPLAY_LIMIT} more)*`);
    }
    lines.push('');
  }

  if (legislators.removed.length > 0) {
    lines.push(`### Removed Legislators (${legislators.removed.length})`);
    for (const l of legislators.removed) {
      lines.push(`* ${l.nameTitle} (${l.bioguideId})`);
    }
    lines.push('');
  }

  if (bills.newLaws.length > 0) {
    lines.push(`### Bills That Became Law (${bills.newLaws.length})`);
    for (const b of bills.newLaws) {
      lines.push(`* [${b.title}](${b.url})`);
    }
    lines.push('');
  }

  if (bills.withNewVotes.length > 0) {
    lines.push(`### Bills With New Votes (${bills.withNewVotes.length})`);
    for (const b of bills.withNewVotes) {
      lines.push(`* [${b.title}](${b.url})`);
    }
    lines.push('');
  }

  if (bills.added.length > 0) {
    lines.push(`### Newly Voted-on Bills (${bills.added.length})`);
    for (const b of bills.added) {
      lines.push(`* [${b.title}](${b.url})`);
    }
    lines.push('');
  }

  if (bills.updated.length > 0) {
    lines.push(`### Updated Bills (${bills.updated.length})`);
    for (const b of bills.updated.slice(0, BILL_DISPLAY_LIMIT)) {
      lines.push(`* [${b.title}](${b.url})`);
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

/**
 * Write the markdown string to prBodyPath, and optionally to GITHUB_STEP_SUMMARY.
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

  // null = explicitly disabled; undefined = read from env
  const summaryPath = stepSummaryPath === null ? undefined : (stepSummaryPath ?? process.env['GITHUB_STEP_SUMMARY']);
  if (summaryPath) {
    fsModule.appendFileSync(summaryPath, markdown + '\n', 'utf8');
  }
}

// ===== MAIN ORCHESTRATOR =====

/**
 * Generate a complete change summary: detect git changes, build structured entry,
 * write per-run JSON, update accumulated JSON, and write PR body markdown.
 *
 * @returns The generated ChangelogEntry
 */
export function generateChangeSummary(options: GenerateChangeSummaryOptions = {}): ChangelogEntry {
  const cwd = options.cwd ?? process.cwd();
  const fsModule = options.fsModule ?? defaultFs;
  const runGit = options.runGit ?? ((cmd: string) => defaultRunGit(cmd, cwd));

  const dataDir = options.dataDir ?? path.join(cwd, 'data');
  const dataPrefix = path.relative(cwd, dataDir).replace(/\\/g, '/') || 'data';
  const changelogDir = options.changelogDir ?? path.join(dataDir, 'changelog');
  const accumulatedPath = options.accumulatedPath ?? path.join(dataDir, 'changelog.json');
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

  updateAccumulatedChangelog(entry, accumulatedPath, fsModule);
  console.log(`Updated: ${accumulatedPath}`);

  const markdown = buildMarkdown(entry);
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
