/**
 * TypeScript types for Congress.gov domain objects
 * These types represent business domain entities that extend or combine API response types
 */
import { SenateRollCallVoteCount } from "./congress-raw-files.types.js";

import {
  ExtendedBillSummary,
  BillAction,
  MemberInfo,
  CommitteeInfo,
  NominationInfo,
  HouseVotePartyTotal,
  RecordedVote,
  BillActionSummary,
  BillTitle,
} from "../api-congress-gov/abstract-api.types.js";

// ===== DOMAIN-SPECIFIC TYPES =====
// These are types that combine or extend API types for business logic

/**
 * Chamber vote results mapped by bioguide ID
 * Key: bioguideId, Value: vote cast (e.g., "Yea", "Nay", "Present", "Not Voting")
 */
export type ChamberVote = {
  [bioguideId: string]: string;
}

/**
 * Collection of chamber votes for a bill
 */
export type BillChamberVotes = {
  houseVotes?: ChamberVote[];
  senateVotes?: ChamberVote[];
}

/** Normalized vote outcome: passed or rejected */
export type VoteResult = "passed" | "rejected";

/** Bill lifecycle state derived from latestAction.text (and related data). */
export type BillState = "becameLaw" | "inProgress" | "rejected";

/**
 * Extended vote data from House recorded vote
 * Returned by fetchHouseVotesForRecordedVote
 */
export type HouseVoteData = {
  votes: ChamberVote;
  result: VoteResult;
  votePartyTotal: HouseVotePartyTotal[];
  voteUrl: string;
  question: string;
}

/**
 * Extended vote data from Senate XML
 * Returned by fetchSenateVotesForRecordedVote
 */
export type SenateVoteData = {
  votes: ChamberVote;
  result: VoteResult;
  senateCount: SenateRollCallVoteCount;
  votePartyTotal?: HouseVotePartyTotal[];
  voteUrl: string;
  question: string;
}

export type RecordedVoteWithVotes = RecordedVote & {
  /** Unique identifier: {congress}-{billType}-{billNumber}-{index} where index 0 is the oldest vote */
  id?: string;
  /** 1-based vote index (oldest vote = 1) */
  voteNumber?: number;
  votes?: ChamberVote;
  result?: VoteResult;
  // Senate-specific fields
  senateCount?: SenateRollCallVoteCount;
  // House-specific fields
  votePartyTotal?: HouseVotePartyTotal[];
  // Common fields
  voteUrl?: string;
  question?: string;
}

/**
 * Parameters for populating recorded votes with IDs
 */
export type PopulateRecordedVotesParams = {
  /** Congressional term (e.g., 119) */
  congress: number;
  /** Bill type (e.g., "HR", "S") */
  billType: string;
  /** Bill number (e.g., "1", "2") */
  billNumber: string;
}

export type BillActionWithVotes = BillAction & {
  recordedVotes?: RecordedVoteWithVotes[];
}

export type ExtendedBillAction = BillActionSummary & {
  actions: BillActionWithVotes[];
}

export type BillTitlesData = {
  titles: BillTitle[];
}

export type BillWithActions = ExtendedBillSummary & {
  id: string;
  actions: ExtendedBillAction;
  titles?: BillTitlesData;
  /** Date of the most recent action (ISO date string). Set by the votes package. */
  lastActionDate?: string;
  /** Date of the most recent recorded vote on the bill (ISO date string). Set by the votes package. */
  lastRecordedVoteDate?: string;
};

// ===== UTILITY TYPES =====

export type CongressApiConfig = {
  baseUrl: string;
  apiKey: string;
  format: 'json' | 'xml';
  timeout?: number;
}
