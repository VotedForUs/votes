/**
 * Types for the structured changelog entry generated after each data update.
 * Written to data/changelog/{date}-{runId}.json (IDs only — display resolved at render / PR time).
 */

export interface ChangelogEntry {
  /** ISO date string: YYYY-MM-DD */
  date: string;
  /** GITHUB_RUN_ID or Date.now() string for local runs */
  runId: string;
  legislators: {
    /** Bioguide IDs */
    added: string[];
    updated: string[];
    removed: string[];
  };
  bills: {
    /** Bill ids: {congress}-{TYPE}-{number} e.g. 119-hr-1 */
    added: string[];
    updated: string[];
    newLaws: string[];
    withNewVotes: string[];
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
  /**
   * Path to the accumulated changelog JSON array (legacy).
   * If omitted, accumulated file is not written.
   */
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
  /**
   * Override for the GITHUB_STEP_SUMMARY path.
   * Pass `null` to explicitly disable step summary writing (useful in tests).
   * Defaults to `process.env['GITHUB_STEP_SUMMARY']`.
   */
  stepSummaryPath?: string | null;
}

/** Options for {@link import('./changelog.js').buildMarkdown} */
export interface BuildMarkdownOptions {
  /** Injectable fs (default: node:fs) */
  fsModule?: typeof import('fs');
  /** Absolute path to data directory (contains legislators/, bills/) */
  dataDir: string;
  /** Base URL for links (default: https://votedfor.us) */
  siteBaseUrl?: string;
}
