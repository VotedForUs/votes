// Main exports for @votedforus/votes package

// Core classes
export { Legislators } from './src/legislators/legislators.js';
export { CongressApi, getBillState, isBillRejectedOrDead, isVotePassed } from './src/congress/congress-api.js';

// Utility classes
export { XmlUtils } from './src/utils/xml-utils.js';
export { YamlUtils } from './src/utils/yaml-utils.js';

export {
  LEGISLATORS_CURRENT_URL,
  LEGISLATORS_SOCIAL_URL
} from './src/legislators/legislators.js';

// Type exports
export type {
  // Legislator types
  Legislator,
  LegislatorBio,
  LegislatorId,
} from './src/legislators/legislators.types.js';

export type {
  // Base API types
  MemberInfo,
  MemberTerm,
  BaseBillSummary,
  ExtendedBillSummary,
  BillAction,
  BillLatestAction,
  CommitteeInfo,
  NominationInfo,
  HouseRollCallVote,
  HouseVoteMember,
  HouseVoteMemberVotes,
  SenateVote,
  SenateVoteMember,
  SenateVoteDetails,
  BillSubject,
  BillPolicyArea,
  BillSponsor,
  BillCosponsor,
  BillCommittee,
  BillRelatedBill,
  BillAmendment,
  RecordedVote,
} from './src/api-congress-gov/abstract-api.types.js';

export type {
  // Congress domain types
  BillWithActions,
  BillState,
  ChamberVote,
  BillChamberVotes,
} from './src/congress/congress-api.types.js';
// Runtime exports only - types are handled by TypeScript declaration files
