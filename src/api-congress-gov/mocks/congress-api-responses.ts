/**
 * Mock API responses for Congress.gov endpoints
 * Each response is properly typed to match the expected api.congress.gov response structure
 */

import {
  // Domain types (only BillWithActions is truly domain-specific)
  BillWithActions,
} from "../../congress/congress-api.types.js";
import {
  // All base types and API response types
  CongressApiRequest,
  CongressApiPagination,
  MemberInfo,
  MemberTerm,
  MemberListInfo,
  CommitteeInfo,
  NominationInfo,
  HouseRollCallVote,
  HouseRollCallVoteDetails,
  HouseVoteMember,
  HouseVoteMemberVotes,
  HouseVotePartyTotal,
  BaseBillSummary,
  BillLatestAction,
  BillAction,
  BillTitle,
  SenateVote,
  HouseVoteListResponse,
  HouseVoteResponse,
  HouseMembersResponse,
  BillResponse,
  BillActionsResponse,
  BillTitlesResponse,
  BillListResponse,
  MemberResponse,
  MemberListResponse,
  SponsoredLegislationItem,
  SponsoredLegislationResponse,
  CosponsoredLegislationItem,
  CosponsoredLegislationResponse,
  CommitteeListResponse,
  NominationListResponse,
  SenateVoteListResponse,
  CongressApiError,
  ExtendedBillSummary,
} from "../abstract-api.types.js";

// ===== COMMON MOCK DATA =====

export const mockCongressApiRequest: CongressApiRequest = {
  congress: "119",
  contentType: "application/json",
  format: "json",
  session: "1",
};

export const mockCongressApiPagination: CongressApiPagination = {
  count: 2,
};

// ===== HOUSE VOTES API RESPONSES =====

export const mockHouseRollCallVotes: HouseRollCallVote[] = [
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

export const mockHouseVoteListResponse: HouseVoteListResponse = {
  houseRollCallVotes: mockHouseRollCallVotes,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

export const mockHouseVoteMembers: HouseVoteMember[] = [
  {
    bioguideID: "A000001",
    firstName: "Alex",
    lastName: "Anderson",
    voteCast: "Yea",
    voteParty: "R",
    voteState: "CA",
  },
  {
    bioguideID: "B000002",
    firstName: "Bob",
    lastName: "Brown",
    voteCast: "Yea",
    voteParty: "D",
    voteState: "TX",
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

export const mockHouseVotePartyTotal: HouseVotePartyTotal[] = [
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

export const mockHouseRollCallVoteDetails: HouseRollCallVoteDetails = {
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
  votePartyTotal: mockHouseVotePartyTotal,
};

export const mockHouseVoteResponse: HouseVoteResponse = {
  houseRollCallVote: mockHouseRollCallVoteDetails,
  request: mockCongressApiRequest,
};

export const mockHouseVoteMemberVotes: HouseVoteMemberVotes = {
  congress: 119,
  identifier: 11912025001,
  legislationNumber: "1",
  legislationType: "HR",
  legislationUrl: "https://api.congress.gov/v3/bill/119/house-bill/1",
  result: "Passed",
  results: mockHouseVoteMembers,
  rollCallNumber: 1,
  sessionNumber: 1,
  sourceDataURL: "https://clerk.house.gov/evs/2025/roll001.xml",
  startDate: "2025-01-03T10:00:00Z",
  updateDate: "2025-01-03T14:23:17-04:00",
  voteQuestion: "On Motion to Concur in the Senate Amendment",
  voteType: "Recorded Vote",
};

export const mockHouseMembersResponse: HouseMembersResponse = {
  houseRollCallVoteMemberVotes: mockHouseVoteMemberVotes,
  request: mockCongressApiRequest,
};

// ===== BILLS API RESPONSES =====

export const mockBillLatestAction: BillLatestAction = {
  actionDate: "2025-01-03",
  text: "Passed House",
};

export const mockBillSummary: ExtendedBillSummary = {
  congress: 119,
  number: "1",
  type: "HR",
  url: "",
  title: "Test Bill for Congress API",
  summary: "A test bill for Congress API testing purposes.",
  latestAction: mockBillLatestAction,
  originChamber: "House",
  originChamberCode: "H",
  introducedDate: "2025-01-03",
  updateDate: "2025-01-03",
};

export const mockBillResponse: BillResponse = {
  bill: mockBillSummary,
};

export const mockBillActions: BillAction[] = [
  {
    actionCode: "1000",
    actionDate: "2025-01-03",
    text: "Introduced in House",
    type: "IntroReferral",
    sourceSystem: {
      code: "9",
      name: "Library of Congress",
    },
  },
  {
    actionCode: "H11100",
    actionDate: "2025-01-03",
    text: "Referred to the House Committee on Agriculture",
    type: "IntroReferral",
    committees: [
      {
        name: "Committee on Agriculture",
        systemCode: "hsag00",
        url: "https://api.congress.gov/v3/committee/house/hsag00",
      },
    ],
    sourceSystem: {
      code: "2",
      name: "House floor actions",
    },
  },
  {
    actionCode: "H12100",
    actionDate: "2025-01-10",
    text: "Reported by the Committee on Agriculture. H. Rept. 119-1.",
    type: "Committee",
    committees: [
      {
        name: "Committee on Agriculture",
        systemCode: "hsag00",
        url: "https://api.congress.gov/v3/committee/house/hsag00",
      },
    ],
    sourceSystem: {
      code: "2",
      name: "House floor actions",
    },
  },
  {
    actionCode: "H30000",
    actionDate: "2025-01-15",
    text: "Considered under suspension of the rules.",
    type: "Floor",
    actionTime: "14:30:00",
    sourceSystem: {
      code: "2",
      name: "House floor actions",
    },
  },
  {
    actionCode: "H37300",
    actionDate: "2025-01-15",
    text: "On passage Passed/agreed to in House: On motion to suspend the rules and pass the bill Agreed to by voice vote.",
    type: "Floor",
    actionTime: "15:45:00",
    recordedVotes: [
      {
        chamber: "House",
        congress: 119,
        date: "2025-01-15",
        rollNumber: 15,
        sessionNumber: 1,
        url: "https://api.congress.gov/v3/house-vote/119/1/15",
      },
    ],
    sourceSystem: {
      code: "2",
      name: "House floor actions",
    },
  },
  {
    actionCode: "S14000",
    actionDate: "2025-01-16",
    text: "Received in the Senate and Read twice and referred to the Committee on Agriculture, Nutrition, and Forestry.",
    type: "IntroReferral",
    committees: [
      {
        name: "Committee on Agriculture, Nutrition, and Forestry",
        systemCode: "ssaf00",
        url: "https://api.congress.gov/v3/committee/senate/ssaf00",
      },
    ],
    sourceSystem: {
      code: "0",
      name: "Senate",
    },
  },
];

export const mockBillActionsResponse: BillActionsResponse = {
  actions: mockBillActions,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// ===== BILL TITLES API RESPONSES =====

export const mockBillTitles: BillTitle[] = [
  {
    title: "Test Bill for Congress API",
    titleType: "Short Title(s) as Introduced",
    titleTypeCode: 1,
    updateDate: "2025-01-03",
  },
  {
    title: "An Act to test the Congress API for the benefit of all Americans",
    titleType: "Official Title as Introduced",
    titleTypeCode: 2,
    updateDate: "2025-01-03",
    billTextVersionCode: "IH",
    billTextVersionName: "Introduced in House",
    chamberCode: "H",
    chamberName: "House",
  },
  {
    title: "Test Bill Act of 2025",
    titleType: "Short Title(s) as Passed House",
    titleTypeCode: 3,
    updateDate: "2025-01-15",
    billTextVersionCode: "EH",
    billTextVersionName: "Engrossed in House",
    chamberCode: "H",
    chamberName: "House",
  },
];

export const mockBillTitlesResponse: BillTitlesResponse = {
  titles: mockBillTitles,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// Mock bill actions with Library of Congress source (should be excluded from chamber votes)
export const mockBillActionsWithLibraryOfCongress: BillAction[] = [
  {
    actionCode: "H37300",
    actionDate: "2025-01-15",
    text: "On passage Passed/agreed to in House: On motion to suspend the rules and pass the bill Agreed to by voice vote.",
    type: "Floor",
    sourceSystem: {
      code: "2",
      name: "House floor actions",
    },
    recordedVotes: [
      {
        chamber: "House",
        congress: 119,
        date: "2025-01-15T10:00:00Z",
        rollNumber: 15,
        sessionNumber: 1,
        url: "https://api.congress.gov/v3/house-vote/119/1/15",
      },
    ],
  },
  {
    actionCode: "8000",
    actionDate: "2025-01-14",
    text: "Passed/agreed to in House: Bill passed by House.",
    type: "Floor",
    sourceSystem: {
      code: "9",
      name: "Library of Congress",
    },
  },
  {
    actionCode: "1000",
    actionDate: "2025-01-03",
    text: "Introduced in House",
    type: "IntroReferral",
    sourceSystem: {
      code: "9",
      name: "Library of Congress",
    },
  },
];

export const mockBillActionsResponseWithLibraryOfCongress: BillActionsResponse = {
  actions: mockBillActionsWithLibraryOfCongress,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// Mock bill list with multiple bills
export const mockBillsList: BaseBillSummary[] = [
  {
    congress: 119,
    number: "1",
    type: "HR",
    title: "Test Bill for Congress API",
    latestAction: {
      actionDate: "2025-01-15",
      text: "Passed House",
    },
    originChamber: "House",
    originChamberCode: "H",
    url: "https://api.congress.gov/v3/bill/119/hr/1",
    introducedDate: "2025-01-03",
    updateDate: "2025-01-15",
  },
  {
    congress: 119,
    number: "2",
    type: "HR",
    title: "Agriculture Reform Act of 2025",
    latestAction: {
      actionDate: "2025-01-10",
      text: "Referred to Committee",
    },
    originChamber: "House",
    originChamberCode: "H",
    url: "https://api.congress.gov/v3/bill/119/hr/2",
    introducedDate: "2025-01-05",
    updateDate: "2025-01-10",
  },
  {
    congress: 119,
    number: "3",
    type: "HR",
    title: "Healthcare Access Improvement Act",
    latestAction: {
      actionDate: "2025-01-12",
      text: "Passed House",
    },
    originChamber: "House",
    originChamberCode: "H",
    url: "https://api.congress.gov/v3/bill/119/hr/3",
    introducedDate: "2025-01-08",
    updateDate: "2025-01-12",
  },
];

export const mockBillListResponse: BillListResponse = {
  bills: mockBillsList,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// Mock bill actions without chamber votes (for testing filtering)
export const mockBillActionsWithoutChamberVotes: BillActionsResponse = {
  actions: [
    {
      actionCode: "1000",
      actionDate: "2025-01-05",
      text: "Introduced in House",
      type: "IntroReferral",
    },
    {
      actionCode: "H11100",
      actionDate: "2025-01-05",
      text: "Referred to Committee",
      type: "IntroReferral",
    },
  ],
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

export const mockBillWithActions: BillWithActions = {
  ...mockBillSummary,
  id: `${mockBillSummary.congress}-${mockBillSummary.type}-${mockBillSummary.number}`,
  actions: {
    actions: mockBillActions,
  },
};

// ===== MEMBERS API RESPONSES =====

export const mockMemberTerms: MemberTerm[] = [
  {
    chamber: "House",
    congress: 119,
    endYear: 2025,
    memberType: "Representative",
    startYear: 2023,
    stateCode: "CA",
    stateName: "California",
  },
  {
    chamber: "House",
    congress: 118,
    endYear: 2023,
    memberType: "Representative",
    startYear: 2021,
    stateCode: "CA",
    stateName: "California",
  },
];

export const mockMemberInfo: MemberInfo = {
  addressInformation: {
    city: "Washington",
    district: "DC",
    officeAddress: "123 Longworth House Office Building",
    phoneNumber: "(202) 225-0001",
    zipCode: 20515,
  },
  bioguideId: "A000001",
  birthYear: "1975",
  cosponsoredLegislation: {
    count: 45,
    url: "https://api.congress.gov/v3/member/A000001/cosponsored-legislation",
  },
  currentMember: true,
  depiction: {
    attribution: "Image courtesy of the Member",
    imageUrl: "https://www.congress.gov/img/member/a000001_200.jpg",
  },
  directOrderName: "Alex J. Anderson",
  district: 1,
  firstName: "Alex",
  honorificName: "Mr.",
  invertedOrderName: "Anderson, Alex J.",
  lastName: "Anderson",
  middleName: "J",
  nickName: "Al",
  officialWebsiteUrl: "https://anderson.house.gov",
  party: "Republican",
  partyHistory: [
    {
      partyAbbreviation: "R",
      partyName: "Republican",
      startYear: 2021,
    },
  ],
  sponsoredLegislation: {
    count: 12,
    url: "https://api.congress.gov/v3/member/A000001/sponsored-legislation",
  },
  state: "CA",
  terms: mockMemberTerms,
  updateDate: "2025-01-03T11:00:00Z",
  url: "https://api.congress.gov/v3/member/A000001",
};

export const mockMemberResponse: MemberResponse = {
  member: mockMemberInfo,
  request: mockCongressApiRequest,
};

export const mockMembersListFull: MemberInfo[] = [
  mockMemberInfo,
  {
    bioguideId: "B000002",
    currentMember: true,
    directOrderName: "Bob Brown",
    firstName: "Bob",
    honorificName: "Mr.",
    invertedOrderName: "Brown, Bob",
    lastName: "Brown",
    party: "Democratic",
    partyHistory: [
      {
        partyAbbreviation: "D",
        partyName: "Democratic",
        startYear: 2021,
      },
    ],
    state: "TX",
    terms: [
      {
        chamber: "Senate",
        congress: 119,
        endYear: 2027,
        memberType: "Senator",
        startYear: 2021,
        stateCode: "TX",
        stateName: "Texas",
      },
    ],
    updateDate: "2025-01-03T11:00:00Z",
    url: "https://api.congress.gov/v3/member/B000002",
  },
  {
    bioguideId: "C000003",
    currentMember: true,
    directOrderName: "Carol Clark",
    district: 5,
    firstName: "Carol",
    honorificName: "Ms.",
    invertedOrderName: "Clark, Carol",
    lastName: "Clark",
    party: "Republican",
    partyHistory: [
      {
        partyAbbreviation: "R",
        partyName: "Republican",
        startYear: 2023,
      },
    ],
    state: "NY",
    terms: [
      {
        chamber: "House",
        congress: 119,
        endYear: 2025,
        memberType: "Representative",
        startYear: 2023,
        stateCode: "NY",
        stateName: "New York",
      },
    ],
    updateDate: "2025-01-03T11:00:00Z",
    url: "https://api.congress.gov/v3/member/C000003",
  },
];

export const mockMembersList: MemberListInfo[] = [
  {
    bioguideId: "A000001",
    depiction: { imageUrl: "https://www.congress.gov/img/member/a000001_200.jpg" },
    district: 1,
    name: "Alex J. Anderson",
    partyName: "Republican",
    state: "CA",
    terms: [{ item: 119 }, { item: 118 }],
    updateDate: "2025-01-03T11:00:00Z",
    url: "https://api.congress.gov/v3/member/A000001",
  },
  {
    bioguideId: "B000002",
    name: "Bob Brown",
    partyName: "Democratic",
    state: "TX",
    terms: [{ item: 119 }],
    updateDate: "2025-01-03T11:00:00Z",
    url: "https://api.congress.gov/v3/member/B000002",
  },
  {
    bioguideId: "C000003",
    depiction: { imageUrl: "https://www.congress.gov/img/member/c000003_200.jpg" },
    district: 5,
    name: "Carol Clark",
    partyName: "Republican",
    state: "NY",
    terms: [{ item: 119 }],
    updateDate: "2025-01-03T11:00:00Z",
    url: "https://api.congress.gov/v3/member/C000003",
  },
];

export const mockMemberListResponse: MemberListResponse = {
  members: mockMembersList,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// ===== MEMBER LEGISLATION API RESPONSES =====

export const mockSponsoredLegislationItems: SponsoredLegislationItem[] = [
  {
    congress: 119,
    latestAction: {
      actionDate: "2025-01-15",
      text: "Referred to Committee",
    },
    number: "101",
    policyArea: { name: "Agriculture and Food" },
    title: "Agricultural Innovation Act of 2025",
    type: "HR",
    url: "https://api.congress.gov/v3/bill/119/hr/101",
    introducedDate: "2025-01-10",
    updateDate: "2025-01-15T11:00:00Z",
  },
  {
    congress: 119,
    latestAction: {
      actionDate: "2025-01-20",
      text: "Passed House",
    },
    number: "202",
    policyArea: { name: "Health" },
    title: "Healthcare Access Improvement Act",
    type: "HR",
    url: "https://api.congress.gov/v3/bill/119/hr/202",
    introducedDate: "2025-01-12",
    updateDate: "2025-01-20T11:00:00Z",
  },
];

export const mockSponsoredLegislationResponse: SponsoredLegislationResponse = {
  sponsoredLegislation: mockSponsoredLegislationItems,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

export const mockCosponsoredLegislationItems: CosponsoredLegislationItem[] = [
  {
    congress: 119,
    latestAction: {
      actionDate: "2025-01-18",
      text: "Referred to Senate Committee",
    },
    number: "303",
    policyArea: { name: "Education" },
    title: "Education Funding Enhancement Act",
    type: "S",
    url: "https://api.congress.gov/v3/bill/119/s/303",
    cosponsorshipDate: "2025-01-14",
    updateDate: "2025-01-18T11:00:00Z",
  },
  {
    congress: 119,
    latestAction: {
      actionDate: "2025-01-22",
      text: "Committee Hearing Scheduled",
    },
    number: "404",
    policyArea: { name: "Environmental Protection" },
    title: "Clean Energy Transition Act",
    type: "S",
    url: "https://api.congress.gov/v3/bill/119/s/404",
    cosponsorshipDate: "2025-01-16",
    updateDate: "2025-01-22T11:00:00Z",
  },
];

export const mockCosponsoredLegislationResponse: CosponsoredLegislationResponse = {
  cosponsoredLegislation: mockCosponsoredLegislationItems,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// ===== COMMITTEES API RESPONSES =====

export const mockCommitteesList: CommitteeInfo[] = [
  {
    chamber: "House",
    name: "Committee on Agriculture",
    systemCode: "hsag",
    type: "Standing",
    url: "https://api.congress.gov/v3/committee/house/hsag",
    updateDate: "2025-01-03T11:00:00Z",
  },
  {
    chamber: "House",
    name: "Committee on Appropriations",
    systemCode: "hsap",
    type: "Standing",
    url: "https://api.congress.gov/v3/committee/house/hsap",
    updateDate: "2025-01-03T11:00:00Z",
  },
  {
    chamber: "Senate",
    name: "Committee on Agriculture, Nutrition, and Forestry",
    systemCode: "ssaf",
    type: "Standing",
    url: "https://api.congress.gov/v3/committee/senate/ssaf",
    updateDate: "2025-01-03T11:00:00Z",
  },
];

export const mockCommitteeListResponse: CommitteeListResponse = {
  committees: mockCommitteesList,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// ===== NOMINATIONS API RESPONSES =====

export const mockNominationsList: NominationInfo[] = [
  {
    congress: 119,
    description: "John Doe to be Secretary of Agriculture",
    latestAction: {
      actionDate: "2025-01-15",
      text: "Confirmed by Senate",
    },
    nominationNumber: "PN1",
    partNumber: "1",
    receivedDate: "2025-01-10",
    url: "https://api.congress.gov/v3/nomination/119/PN1",
    updateDate: "2025-01-15T11:00:00Z",
  },
  {
    congress: 119,
    description: "Jane Smith to be Secretary of Commerce",
    latestAction: {
      actionDate: "2025-01-12",
      text: "Received in Senate",
    },
    nominationNumber: "PN2",
    partNumber: "1",
    receivedDate: "2025-01-12",
    url: "https://api.congress.gov/v3/nomination/119/PN2",
    updateDate: "2025-01-12T11:00:00Z",
  },
];

export const mockNominationListResponse: NominationListResponse = {
  nominations: mockNominationsList,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// ===== SENATE VOTES API RESPONSES =====

export const mockSenateVotes: SenateVote[] = [
  {
    congress: 119,
    date: "2025-01-15",
    issue: "Confirmation of John Doe",
    question: "On the Nomination",
    result: "Confirmed",
    title: "Confirmation Vote",
    vote_number: 1,
    vote_tally: {
      yeas: 52,
      nays: 48,
      present: 0,
      absent: 0,
    },
    vote_document_text: "The nomination was confirmed.",
    vote_document_url: "https://senate.gov/legislative/LIS/roll_call_lists/roll_call_vote_cfm.cfm?congress=119&session=1&vote=00001",
  },
  {
    congress: 119,
    date: "2025-01-16",
    issue: "H.R. 1 - Test Bill",
    question: "On Passage of the Bill",
    result: "Passed",
    title: "Final Passage",
    vote_number: 2,
    vote_tally: {
      yeas: 55,
      nays: 45,
      present: 0,
      absent: 0,
    },
  },
];

export const mockSenateVoteListResponse: SenateVoteListResponse = {
  votes: mockSenateVotes,
  pagination: mockCongressApiPagination,
  request: mockCongressApiRequest,
};

// ===== ERROR RESPONSES =====

export const mockCongressApiErrors = {
  unauthorized: {
    error: "Authentication failed",
    message: "Invalid API key",
    request: {
      contentType: "application/json",
      format: "json",
    },
  } as CongressApiError,

  forbidden: {
    error: "Access forbidden",
    message: "Insufficient permissions",
    request: {
      contentType: "application/json",
      format: "json",
    },
  } as CongressApiError,

  notFound: {
    error: "No Bill matches the given query.",
    request: {
      billNumber: "999",
      billType: "hr",
      congress: "119",
      contentType: "application/json",
      format: "json",
    },
  } as CongressApiError,

  rateLimit: {
    error: "Rate limit exceeded",
    message: "Too many requests",
    request: {
      contentType: "application/json",
      format: "json",
    },
  } as CongressApiError,

  serverError: {
    error: "Internal server error",
    message: "Server error occurred",
    request: {
      contentType: "application/json",
      format: "json",
    },
  } as CongressApiError,
};

// ===== ENDPOINT-SPECIFIC RESPONSES =====

/**
 * Mock responses organized by endpoint for easy lookup in tests
 */
export const mockEndpointResponses = {
  // House votes endpoints
  "/house-vote/119/1": mockHouseVoteListResponse,
  "/house-vote/119/2": mockHouseVoteListResponse,
  "/house-vote/119/1/1": mockHouseVoteResponse,
  "/house-vote/119/1/1/members": mockHouseMembersResponse,
  "/house-vote/119/1/2/members": mockHouseMembersResponse,
  "/house-vote/119/1/3/members": mockHouseMembersResponse,

  // Bills endpoints
  "/bill/119": mockBillListResponse,
  "/bill/119/hr": mockBillListResponse,
  "/bill/119/hr/1": mockBillResponse,
  "/bill/119/hr/2": mockBillResponse,
  "/bill/118/hr/3": mockBillResponse,
  "/bill/119/hr/1/actions": mockBillActionsResponse,
  "/bill/119/hr/2/actions": mockBillActionsResponse,
  "/bill/118/hr/3/actions": mockBillActionsResponse,
  "/bill/119/hr/1/titles": mockBillTitlesResponse,
  "/bill/119/hr/2/titles": mockBillTitlesResponse,
  "/bill/118/hr/3/titles": mockBillTitlesResponse,

  // Members endpoints
  "/member": mockMemberListResponse,
  "/member/A000001": mockMemberResponse,
  "/member/A000001/sponsored-legislation": mockSponsoredLegislationResponse,
  "/member/A000001/cosponsored-legislation": mockCosponsoredLegislationResponse,

  // Committees endpoints
  "/committee/119": mockCommitteeListResponse,
  "/committee/119/house": mockCommitteeListResponse,
  "/committee/119/senate": mockCommitteeListResponse,

  // Nominations endpoints
  "/nomination/119": mockNominationListResponse,

  // Test endpoints
  "/test-endpoint": { success: true, data: "test response" },
  "/test-cache": { cached: true, data: "cached response" },
};

// ===== LEGACY COMPATIBILITY =====
// Re-export some items with original names for backward compatibility

export const mockCongressVoteListResponse = mockHouseVoteListResponse;
export const mockCongressHouseVoteResponse = mockHouseVoteResponse;
export const mockCongressMembersResponse = mockHouseMembersResponse;
export const mockCongressBillResponse = mockBillResponse;
export const mockErrorResponses = mockCongressApiErrors;
