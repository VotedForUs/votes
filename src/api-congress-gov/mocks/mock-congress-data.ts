import {
  HouseRollCallVote,
  HouseRollCallVoteDetails,
  HouseVoteListResponse,
  HouseVoteMember,
  HouseVoteMemberVotes,
  HouseVotePartyTotal,
  HouseMembersResponse,
} from "../abstract-api.types.js";

/**
 * Mock legislator data for Congress API tests
 */
export const mockCongressLegislatorsData = {
  legislators: [
    {
      id: { bioguide: "A000001" },
      name: { first: "Alex", last: "Anderson" },
      latest_term: {
        type: "rep",
        state: "CA",
        party: "Republican",
        district: "1",
      },
    },
    {
      id: { bioguide: "B000002" },
      name: { first: "Bob", last: "Brown" },
      latest_term: {
        type: "sen",
        state: "TX",
        party: "Democratic",
      },
    },
    {
      id: { bioguide: "C000003" },
      name: { first: "Carol", last: "Clark" },
      latest_term: {
        type: "rep",
        state: "NY",
        party: "Republican",
        district: "5",
      },
    },
    {
      id: { bioguide: "S000001" },
      name: { first: "John", last: "Sullivan" },
      latest_term: {
        type: "sen",
        state: "AK",
        party: "Republican",
      },
    },
  ],
};

/**
 * Mock House roll call votes for Congress API tests
 */
export const mockCongressHouseVotes: HouseRollCallVote[] = [
  {
    congress: 119,
    identifier: 1,
    legislationNumber: "1",
    legislationType: "HR",
    legislationUrl: "https://api.congress.gov/v3/bill/119/house-bill/1",
    result: "Passed",
    rollCallNumber: 1,
    sessionNumber: 1,
    sourceDataURL: "https://clerk.house.gov/evs/2025/roll001.xml",
    startDate: "2025-01-03T10:00:00Z",
    updateDate: "2025-01-03T11:00:00Z",
    url: "https://api.congress.gov/v3/house-vote/119/1/1",
    voteType: "Final Passage",
  },
  {
    congress: 119,
    identifier: 2,
    legislationNumber: "2",
    legislationType: "HR",
    legislationUrl: "https://api.congress.gov/v3/bill/119/house-bill/2",
    result: "Failed",
    rollCallNumber: 2,
    sessionNumber: 1,
    sourceDataURL: "https://clerk.house.gov/evs/2025/roll002.xml",
    startDate: "2025-01-04T10:00:00Z",
    updateDate: "2025-01-04T11:00:00Z",
    url: "https://api.congress.gov/v3/house-vote/119/1/2",
    voteType: "Final Passage",
  },
];

/**
 * Mock House vote members for Congress API tests
 */
export const mockCongressHouseVoteMembers: HouseVoteMember[] = [
  {
    bioguideID: "A000001",
    firstName: "Alex",
    lastName: "Anderson",
    voteCast: "Yea",
    voteParty: "R",
    voteState: "CA",
  },
  {
    bioguideID: "C000003",
    firstName: "Carol",
    lastName: "Clark",
    voteCast: "Nay",
    voteParty: "R",
    voteState: "NY",
  },
];

/**
 * Mock House vote party totals for Congress API tests
 */
export const mockCongressHouseVotePartyTotal: HouseVotePartyTotal[] = [
  {
    party: { name: "Republican", type: "R" },
    voteParty: "R",
    yeaTotal: 218,
    nayTotal: 2,
    presentTotal: 0,
    notVotingTotal: 0,
  },
  {
    party: { name: "Democrat", type: "D" },
    voteParty: "D",
    yeaTotal: 0,
    nayTotal: 212,
    presentTotal: 0,
    notVotingTotal: 0,
  },
];

/**
 * Mock House vote details for Congress API tests
 */
export const mockCongressHouseVoteDetails: HouseRollCallVoteDetails = {
  congress: 119,
  identifier: 11912025001,
  sessionNumber: 1,
  rollCallNumber: 1,
  startDate: "2025-01-03T10:00:00Z",
  updateDate: "2025-01-03T14:23:17-04:00",
  voteQuestion: "On Motion to Concur in the Senate Amendment",
  voteType: "Recorded Vote",
  result: "Passed",
  sourceDataURL: "https://clerk.house.gov/evs/2025/roll001.xml",
  legislationType: "HR",
  legislationNumber: "1",
  legislationUrl: "https://api.congress.gov/v3/bill/119/house-bill/1",
  votePartyTotal: mockCongressHouseVotePartyTotal,
};

/**
 * Mock House vote list response for Congress API tests
 */
export const mockCongressVoteListResponse: HouseVoteListResponse = {
  houseRollCallVotes: mockCongressHouseVotes,
  pagination: {
    count: 2,
    next: undefined,
  },
  request: {
    congress: "119",
    contentType: "application/json",
    format: "json",
    session: "1",
  },
};

/**
 * Mock House vote member votes for Congress API tests
 */
export const mockCongressHouseVoteMemberVotes: HouseVoteMemberVotes = {
  congress: 119,
  identifier: 11912025001,
  legislationNumber: "1",
  legislationType: "HR",
  legislationUrl: "https://api.congress.gov/v3/bill/119/house-bill/1",
  result: "Passed",
  results: mockCongressHouseVoteMembers,
  rollCallNumber: 1,
  sessionNumber: 1,
  sourceDataURL: "https://clerk.house.gov/evs/2025/roll001.xml",
  startDate: "2025-01-03T10:00:00Z",
  updateDate: "2025-01-03T14:23:17-04:00",
  voteQuestion: "On Motion to Concur in the Senate Amendment",
  voteType: "Recorded Vote",
};

/**
 * Mock members response for Congress API tests
 */
export const mockCongressMembersResponse: HouseMembersResponse = {
  houseRollCallVoteMemberVotes: mockCongressHouseVoteMemberVotes,
  request: {
    congress: "119",
    contentType: "application/json",
    format: "json",
    session: "1",
  },
};

/**
 * Mock bill info for Congress API tests
 */
export const mockCongressBillInfo = {
  type: "HR",
  number: "1",
  title: "Test Bill for Congress API",
  summary: "A test bill for Congress API testing purposes.",
  latestAction: {
    actionDate: "2025-01-03",
    text: "Passed House",
  },
  url: "https://api.congress.gov/v3/bill/119/hr/1",
};

/**
 * Mock bill response for Congress API tests (raw API response format)
 */
export const mockCongressBillResponse = {
  bill: {
    congress: 119,
    number: "1",
    type: "HR",
    title: "Test Bill for Congress API",
    summary: "A test bill for Congress API testing purposes.",
    latestAction: {
      actionDate: "2025-01-03",
      text: "Passed House",
    },
    url: "https://api.congress.gov/v3/bill/119/hr/1",
    introducedDate: "2025-01-03",
    originChamber: "House",
    policyArea: {
      name: "Government Operations and Politics"
    },
    subjects: [
      {
        name: "Government operations and politics"
      }
    ]
  },
  request: {
    billNumber: "1",
    billType: "hr",
    congress: "119",
    contentType: "application/json",
    format: "json"
  }
};

/**
 * Mock error responses for testing error handling
 */
export const mockErrorResponses = {
  unauthorized: {
    error: "Authentication failed",
    message: "Invalid API key",
  },
  forbidden: {
    error: "Access forbidden",
    message: "Insufficient permissions",
  },
  notFound: {
    error: "No Bill matches the given query.",
    request: {
      billNumber: "999",
      billType: "hr",
      congress: "119",
      contentType: "application/json",
      format: "json",
    },
  },
  rateLimit: {
    error: "Rate limit exceeded",
    message: "Too many requests",
  },
  serverError: {
    error: "Internal server error",
    message: "Server error occurred",
  },
};
