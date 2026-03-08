/**
 * API Response types for Congress.gov endpoints
 * These types match the expected structure from api.congress.gov responses
 */

// ===== COMMON RESPONSE TYPES =====
// export type TNumber = number;
// export type TYear = `${TNumber}${TNumber}${TNumber}`;
// export type TMonth = `${TNumber}${TNumber}`;
// export type TDay = `${TNumber}${TNumber}`;
// export type TDateISODate = `${TYear}-${TMonth}-${TDay}`;
// export type THour = `${TNumber}${TNumber}`;
// export type TMinute = `${TNumber}${TNumber}`;
// export type TSecond = `${TNumber}${TNumber}`;
// export type TTimeISOTime = `${THour}:${TMinute}:${TSecond}`;
// export type TDateTimeISO = `${TDateISODate}T${TTimeISOTime}`;

export type CongressApiRequest = {
  congress?: string;
  contentType: string;
  format: string;
  session?: string;
}

export type CongressApiPagination = {
  count: number;
  next?: string;
  prev?: string;
}

export type CongressApiParams = {
  format?: 'xml' | 'json';
}

export type CongressApiParamsList = CongressApiParams & {
  offset?: number;
  limit?: number;
}

export type MemberListParams = CongressApiParamsList & {
  currentMember?: boolean;
  fromDateTime?: string;
  toDateTime?: string;
}

// House Votes API params
export type HouseVoteListParams = CongressApiParamsList;

// Bill API params
export type BillListParams = CongressApiParamsList & {
  fromDateTime?: string;
  toDateTime?: string;
}

export type BillActionsParams = CongressApiParamsList;

export type BillTitlesParams = CongressApiParamsList;

// Member Legislation API params
export type SponsoredLegislationParams = CongressApiParamsList;

export type CosponsoredLegislationParams = CongressApiParamsList;

// Committee API params
export type CommitteeListParams = CongressApiParamsList;

// Nomination API params
export type NominationListParams = CongressApiParamsList;

// ===== BASE INFO TYPES =====

export type PartyHistory = {
  partyAbbreviation: string;
  partyName: string;
  startYear: number;
}

export type Leadership = {
  congress?: number;
  current?: boolean;
  type?: string;
}

export type PreviousName = {
  directOrderName: string;
  endDate?: string;
  firstName: string;
  honorificName: string;
  invertedOrderName: string;
  lastName: string;
  startDate: string;
}

export type AddressInformation = {
  city: string;
  district: string;
  officeAddress: string;
  phoneNumber: string;
  zipCode: number;
}

export type Depiction = {
  attribution?: string;
  imageUrl: string;
}

export type LegislationReference = {
  count: number;
  url: string;
}

export type MemberTerm = {
  chamber: string;
  congress: number;
  district?: number;
  endYear: number;
  memberType: string;
  startYear: number;
  stateCode: string;
  stateName: string;
}

export type MemberInfo = {
  addressInformation?: AddressInformation;
  bioguideId: string;
  birthYear?: string;
  cosponsoredLegislation?: LegislationReference;
  currentMember: boolean;
  depiction?: Depiction;
  directOrderName: string;
  district?: number;
  firstName: string;
  honorificName: string;
  invertedOrderName: string;
  lastName: string;
  leadership?: Leadership[];
  middleName?: string;
  nickName?: string;
  officialWebsiteUrl?: string;
  party: string;
  partyHistory: PartyHistory[];
  previousNames?: PreviousName[];
  sponsoredLegislation?: LegislationReference;
  state: string;
  terms: MemberTerm[];
  updateDate: string;
  url: string;
}

export type CommitteeInfo = {
  chamber: string;
  name: string;
  systemCode: string;
  type: string;
  url: string;
  updateDate: string;
}

export type NominationInfo = {
  congress: number;
  description: string;
  latestAction?: {
    actionDate: string;
    text: string;
  };
  nominationNumber: string;
  partNumber: string;
  receivedDate: string;
  url: string;
  updateDate: string;
}

// ===== HOUSE VOTES TYPES =====

export type HouseVoteParty = {
  name?: string;
  type?: string;
}

/**
 * House vote party total structure from API
 * Represents vote counts for a specific party
 */
export type HouseVotePartyTotal = {
  party?: HouseVoteParty;
  voteParty?: string;
  yeaTotal?: number;
  nayTotal?: number;
  presentTotal?: number;
  notVotingTotal?: number;
}

/**
 * House roll call vote from list endpoint
 * Structure from /house-vote/{congress}/{session} endpoint
 */
export type HouseRollCallVote = {
  congress: number;
  identifier: number;
  legislationNumber?: string;
  legislationType?: string;
  legislationUrl?: string;
  result: string;
  rollCallNumber: number;
  sessionNumber: number;
  sourceDataURL: string;
  startDate: string;
  updateDate: string;
  url: string;
  voteType: string;
}

/**
 * Detailed house roll call vote from detail endpoint
 * Structure from /house-vote/{congress}/{session}/{rollCallNumber} endpoint
 * Contains complete vote information including party totals
 */
export type HouseRollCallVoteDetails = {
  congress: number;
  identifier: number;
  sessionNumber: number;
  rollCallNumber: number;
  startDate: string;
  updateDate: string;
  voteQuestion: string;
  voteType: string;
  result: string;
  sourceDataURL: string;
  legislationType?: string;
  legislationNumber?: string;
  legislationUrl?: string;
  votePartyTotal: HouseVotePartyTotal[];
}

/**
 * House vote member from members endpoint
 * Structure from /house-vote/{congress}/{session}/{rollCallNumber}/members endpoint
 */
export type HouseVoteMember = {
  bioguideID: string;
  firstName: string;
  lastName: string;
  voteCast: string;
  voteParty: string;
  voteState: string;
}

/**
 * House vote member votes wrapper from members endpoint
 * Contains metadata and array of member votes
 */
export type HouseVoteMemberVotes = {
  congress: number;
  identifier: number;
  legislationNumber: string;
  legislationType: string;
  legislationUrl: string;
  result: string;
  results: HouseVoteMember[];
  rollCallNumber: number;
  sessionNumber: number;
  sourceDataURL: string;
  startDate: string;
  updateDate: string;
  voteQuestion: string;
  voteType: string;
}

// ===== SENATE VOTES TYPES =====

export type SenateVote = {
  congress: number;
  date: string;
  issue: string;
  question: string;
  result: string;
  title: string;
  vote_number: number;
  vote_tally?: {
    yeas: number;
    nays: number;
    present: number;
    absent: number;
  };
  vote_document_text?: string;
  vote_document_url?: string;
}

export type SenateVoteMember = {
  bioguide_id: string;
  first_name: string;
  last_name: string;
  party: string;
  state: string;
  vote_cast: string;
}

export type SenateVoteDetails = {
  congress: number;
  date: string;
  issue: string;
  question: string;
  result: string;
  title: string;
  vote_number: number;
  members: SenateVoteMember[];
  vote_tally: {
    yeas: number;
    nays: number;
    present: number;
    absent: number;
  };
}

// ===== BILLS TYPES =====

// Common recorded vote structure used in both actions and bill summaries
export type RecordedVote = {
  chamber: string;
  congress: number;
  date: string;
  rollNumber: number;
  sessionNumber: number;
  url: string;
}

export type BillAction = {
  actionCode?: string;
  actionDate: string;
  text: string;
  type?: string;
  actionTime?: string;
  committees?: Array<{
    name: string;
    systemCode: string;
    url: string;
  }>;
  recordedVotes?: RecordedVote[];
  sourceSystem?: {
    code?: string | number;
    name: string;
  };
}

export type BillLatestAction = {
  actionDate: string;
  actionTime?: string;
  text: string;
  actionCode?: string;
}

export type BillSubject = {
  name: string;
  updateDate?: string;
}

export type BillPolicyArea = {
  name: string;
  updateDate?: string;
}

export type BillSponsor = {
  bioguideId: string;
  district?: number;
  firstName: string;
  fullName: string;
  lastName: string;
  middleName?: string;
  party: string;
  state: string;
  url: string;
}

export type BillCosponsor = {
  bioguideId: string;
  district?: number;
  firstName: string;
  fullName: string;
  lastName: string;
  middleName?: string;
  party: string;
  sponsorshipDate: string;
  sponsorshipWithdrawnDate?: string;
  state: string;
  url: string;
}

export type BillCommittee = {
  name: string;
  systemCode: string;
  url: string;
  activities?: Array<{
    date: string;
    name: string;
  }>;
  subcommittees?: Array<{
    name: string;
    systemCode: string;
    url: string;
    activities?: Array<{
      date: string;
      name: string;
    }>;
  }>;
}

export type BillRelatedBill = {
  congress: number;
  latestAction?: BillLatestAction;
  number: string;
  relationshipDetails?: Array<{
    identifiedBy: string;
    type: string;
  }>;
  title: string;
  type: string;
  url: string;
}

export type BillAmendment = {
  congress: number;
  latestAction?: BillLatestAction;
  number: string;
  purpose: string;
  type: string;
  url: string;
}

export type BillTitle = {
  title: string;
  titleType: string;
  titleTypeCode: number;
  updateDate?: string;
  billTextVersionCode?: string;
  billTextVersionName?: string;
  chamberCode?: string;
  chamberName?: string;
}

// Bill types as a const array for iteration and type derivation
export const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'] as const;
export type BillType = typeof BILL_TYPES[number];
export type BillTypeUpper = Uppercase<BillType>;
// Union type for backwards compatibility (accepts both lowercase and uppercase)
export type BillTypes = BillType | BillTypeUpper;
export type Chambers = 'house' | 'senate' | 'House' | 'Senate';
export type ChamberCodes = 'h' | 's' | 'H' | 'S';

export type BaseBillSummary = {
  congress: number;
  number: string;
  type: BillTypes;
  title: string;
  summary?: string;
  latestAction?: BillLatestAction;
  originChamber: Chambers;
  originChamberCode: ChamberCodes;
  url?: string;
  introducedDate?: string;
  updateDate?: string;
}

export type BillActionSummary = {
  count?: number;
  url?: string;
}
// Extended bill summary interface - contains additional fields that may be present
export type ExtendedBillSummary = BaseBillSummary & {
  constitutionalAuthorityStatementText?: string;
  policyArea?: BillPolicyArea;
  subjects?: BillSubject;
  sponsors?: BillSponsor;
  actions?: BillActionSummary;
  cosponsors?: BillCosponsor;
  committees?: BillCommittee;
  committeeReports?: Array<{
    citation: string;
    url: string;
  }>;
  relatedBills?: BillRelatedBill;
  amendments?: BillAmendment;
  cboCostEstimates?: Array<{
    description: string;
    pubDate: string;
    title: string;
    url: string;
  }>;
  laws?: Array<{
    number: string;
    type: string;
  }>;
  notes?: Array<{
    text: string;
  }>;
  textVersions?: Array<{
    date: string;
    type: string;
    formats: Array<{
      type: string;
      url: string;
    }>;
  }>;
}

// ===== HOUSE VOTES API RESPONSE TYPES =====

export type HouseVoteListResponse = {
  houseRollCallVotes: HouseRollCallVote[];
  pagination: CongressApiPagination;
  request: CongressApiRequest;
}

export type HouseVoteResponse = {
  houseRollCallVote: HouseRollCallVoteDetails;
  request: CongressApiRequest;
}

export type HouseMembersResponse = {
  houseRollCallVoteMemberVotes: HouseVoteMemberVotes;
  request: CongressApiRequest;
}

// ===== SENATE VOTES API RESPONSE TYPES =====

export type SenateVoteListResponse = {
  votes: SenateVote[];
  pagination: CongressApiPagination;
  request: CongressApiRequest;
}

// ===== BILLS API RESPONSE TYPES =====

export type BillResponse = {
  bill: ExtendedBillSummary;
  request?: CongressApiRequest;
}

export type BillActionsResponse = {
  actions: BillAction[];
  pagination?: CongressApiPagination;
  request?: CongressApiRequest;
}

export type BillListResponse = {
  bills: BaseBillSummary[];
  pagination: CongressApiPagination;
  request: CongressApiRequest;
}

export type BillTitlesResponse = {
  titles: BillTitle[];
  pagination?: CongressApiPagination;
  request?: CongressApiRequest;
}

// ===== MEMBERS API RESPONSE TYPES =====

export type MemberResponse = {
  member: MemberInfo;
  request?: CongressApiRequest;
}

export type MemberListInfo = {
  bioguideId: string;
  depiction?: { imageUrl: string };
  district?: number;
  name: string;
  partyName: string;
  state: string;
  terms: { item: number }[];
  updateDate: string;
  url: string;
}

export type MemberListResponse = {
  members: MemberListInfo[];
  pagination: CongressApiPagination;
  request: CongressApiRequest;
}

// ===== MEMBER LEGISLATION RESPONSE TYPES =====

export type SponsoredLegislationItem = {
  congress: number;
  latestAction?: BillLatestAction;
  number: string;
  policyArea?: { name: string };
  title: string;
  type: string;
  url: string;
  introducedDate?: string;
  updateDate?: string;
}

export type SponsoredLegislationResponse = {
  sponsoredLegislation: SponsoredLegislationItem[];
  pagination: CongressApiPagination;
  request: CongressApiRequest;
}

export type CosponsoredLegislationItem = {
  congress: number;
  latestAction?: BillLatestAction;
  number: string;
  policyArea?: { name: string };
  title: string;
  type: string;
  url: string;
  cosponsorshipDate?: string;
  cosponsorshipWithdrawnDate?: string;
  updateDate?: string;
}

export type CosponsoredLegislationResponse = {
  cosponsoredLegislation: CosponsoredLegislationItem[];
  pagination: CongressApiPagination;
  request: CongressApiRequest;
}

// ===== COMMITTEES API RESPONSE TYPES =====

export type CommitteeListResponse = {
  committees: CommitteeInfo[];
  pagination: CongressApiPagination;
  request: CongressApiRequest;
}

// ===== NOMINATIONS API RESPONSE TYPES =====

export type NominationListResponse = {
  nominations: NominationInfo[];
  pagination: CongressApiPagination;
  request: CongressApiRequest;
}

// ===== ERROR RESPONSE TYPES =====

export type CongressApiError = {
  error: string;
  message?: string;
  request?: {
    [key: string]: string;
  };
}

// ===== UTILITY RESPONSE TYPES =====

// export type CongressApiResponse<T> = T | CongressApiError;
