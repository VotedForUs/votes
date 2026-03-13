/**
 * Types for the structured changelog entry generated after each data update.
 * Written to data/changelog/{date}-{runId}.json and accumulated in data/changelog.json.
 */

export interface LegislatorChangeItem {
  bioguideId: string;
  nameTitle: string;
  state: string;
  party: string;
  url: string;
}

export interface BillChangeItem {
  id: string;
  title: string;
  congress: number;
  billType: string;
  number: string;
  url: string;
}

export interface ChangelogEntry {
  /** ISO date string: YYYY-MM-DD */
  date: string;
  /** GITHUB_RUN_ID or Date.now() string for local runs */
  runId: string;
  legislators: {
    added: LegislatorChangeItem[];
    updated: LegislatorChangeItem[];
    removed: LegislatorChangeItem[];
  };
  bills: {
    added: BillChangeItem[];
    updated: BillChangeItem[];
    /** Bills that became law since the last update */
    newLaws: BillChangeItem[];
    /** Bills that received new recorded votes since the last update */
    withNewVotes: BillChangeItem[];
  };
}

/** A raw git-status file change entry */
export interface RawChange {
  status: 'A' | 'M' | 'D';
  repoRelativePath: string;
}

/** Options for generateChangeSummary */
export interface GenerateChangeSummaryOptions {
  /** Path to the data/ directory (default: {cwd}/data) */
  dataDir?: string;
  /** Path to the data/changelog/ directory (default: {dataDir}/changelog) */
  changelogDir?: string;
  /** Path to the accumulated changelog JSON (default: {dataDir}/changelog.json) */
  accumulatedPath?: string;
  /** Path to write the PR body markdown (default: {cwd}/.github/pr-body.md) */
  prBodyPath?: string;
  /** Run ID string (default: GITHUB_RUN_ID env var or Date.now()) */
  runId?: string;
  /** Today's date as YYYY-MM-DD (default: current date) */
  today?: string;
  /** Site base URL for constructing links (default: https://votedfor.us) */
  siteBaseUrl?: string;
  /** Working directory override for testing (default: process.cwd()) */
  cwd?: string;
  /** Injectable fs module for testing */
  fsModule?: typeof import('fs');
  /** Injectable git runner for testing */
  runGit?: (cmd: string) => string;
}
