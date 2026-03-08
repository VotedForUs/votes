/**
 * Types for bills CLI command
 */

import type { BillLatestAction, BillAction } from "../api-congress-gov/abstract-api.types.js";
import type { BillActionWithVotes, BillChamberVotes, BillWithActions, ExtendedBillAction } from "../congress/congress-api.types.js";
import type { CongressApi } from "../congress/congress-api.js";

/**
 * Reduced bill data for CLI output
 */
export interface BillSmall {
  id?: string;
  actions?: ExtendedBillAction;
  congress?: number;
  number?: string;
  title?: string;
  type?: string;
  updatedDate?: string;
  latestAction?: BillLatestAction;
  lastActionDate?: string;
  lastRecordedVoteDate?: string;
}

/**
 * Full bill data with actions
 */
export interface BillWithDetails {
  title: string;
  chamberVotes?: BillChamberVotes;
  updatedDate?: string;
  latestAction?: BillLatestAction;
  actions?: BillAction[];
  congress: number;
  number: string;
  type: string;
  originChamber: string;
  url: string;
}

/**
 * Result of writing voted bills
 */
export interface WriteVotedBillsResult {
  success: boolean;
  count?: number;
  error?: string;
}

/**
 * Options for writeVotedBills function
 */
export interface WriteVotedBillsOptions {
  term: number;
  billType: string;
  outputDir: string;
  small: boolean;
  limit?: number;
  CongressApiClass?: typeof CongressApi;
}

/**
 * Options for buildFromCache function
 */
export interface BuildFromCacheOptions {
  term: number;
  billType?: string;  // Optional - if not provided, builds all bill types
  outputDir: string;
  cacheDir?: string;  // Defaults to .cache/congress
  small: boolean;
  CongressApiClass?: typeof CongressApi;
  /** Directory for editorial files (if provided, generates editorial after build) */
  editorialDir?: string;
}

/**
 * Result of building from cache
 */
export interface BuildFromCacheResult {
  success: boolean;
  count?: number;
  error?: string;
  billTypes?: { type: string; count: number }[];
}

/**
 * Options for fetchOneBill
 */
export interface FetchOneBillOptions {
  term: number;
  billType: string;
  billNumber: string;
  small?: boolean;
  outputDir?: string;
  cacheDir?: string;
  CongressApiClass?: typeof CongressApi;
}

/**
 * Result of fetching one bill
 */
export interface FetchOneBillResult {
  success: boolean;
  bill?: BillWithActions | BillSmall;
  error?: string;
}

