/**
 * Types for editorial content generation
 */

/**
 * Editorial content for a bill
 * User-editable fields (title, questions) are optional and never overwritten
 * Default fields are always updated from source data
 */
export interface EditorialBill {
  /** Bill ID */
  id: string;
  /** Bill ID */
  bill: string;
  /** User-defined custom title (never overwritten if set) */
  title?: string;
  /** Best title from source data (always updated) */
  defaultTitle: string;
  /** All available titles from bill.titles.titles (always updated) */
  billTitles: string[];
  /** User-defined question overrides by recorded-vote-id: { [id]: questionText } (never overwritten if set) */
  questions?: Record<string, string>;
  /** Default questions from recorded votes: { [id]: questionText } (always updated) */
  defaultQuestions: Record<string, string>;
}

/**
 * Options for generating editorial files
 */
export interface GenerateEditorialOptions {
  /** Congressional term (defaults to 119) */
  term?: number;
  /** Optional bill type filter */
  billType?: string;
  /** Source bills directory */
  sourceDir: string;
  /** Output editorial directory */
  outputDir: string;
}

/**
 * Result from editorial generation
 */
export interface GenerateEditorialResult {
  success: boolean;
  created: number;
  updated: number;
  error?: string;
}
