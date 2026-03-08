import {
  RawLegislatorsData,
  RawLegislatorsSocialMediaData,
  RawSenateMemberData,
} from "../legislators-raw-files.types.js";

/**
 * Mock data for legislators-current.yaml
 */
export const mockLegislatorsData: RawLegislatorsData = [
  {
    id: {
      bioguide: "A000001",
      thomas: "00123",
      govtrack: 400001,
      opensecrets: "N00000001",
      votesmart: 1001,
      fec: ["H0CA00001"],
      cspan: 1001,
      wikipedia: "Alex_Anderson",
      house_history: 2001,
      ballotpedia: "Alex_Anderson",
      maplight: 3001,
      icpsr: 4001,
      wikidata: "Q1001",
      google_entity_id: "/m/0abc123",
      pictorial: 5001,
    },
    name: {
      first: "Alex",
      last: "Anderson",
      official_full: "Alex Anderson",
      nickname: "Al",
      middle: "A",
      suffix: "Jr.",
    },
    bio: {
      birthday: "1980-01-01",
      gender: undefined, // Ambiguous gender
      religion: undefined, // Ambiguous religion
    },
    terms: [
      {
        type: "rep",
        start: "2023-01-03",
        end: "2025-01-03",
        state: "CA",
        district: 1,
        party: "Republican",
        class: undefined,
        state_rank: undefined,
        url: "https://anderson.house.gov",
        address: "123 Capitol St",
        office: "1234",
        phone: "202-555-0001",
        fax: "202-555-0002",
        contact_form: "https://anderson.house.gov/contact",
        rss_url: "https://anderson.house.gov/rss.xml",
        how: "election",
      },
      {
        type: "rep",
        start: "2021-01-03",
        end: "2023-01-03",
        state: "CA",
        district: 1,
        party: "Republican",
        class: undefined,
        state_rank: undefined,
        url: "https://anderson.house.gov",
        address: "123 Capitol St",
        office: "1234",
        phone: "202-555-0001",
        fax: "202-555-0002",
        contact_form: "https://anderson.house.gov/contact",
        rss_url: "https://anderson.house.gov/rss.xml",
        how: "election",
      },
    ],
  },
  {
    id: {
      bioguide: "B000002",
      thomas: "00234",
      govtrack: 400002,
      opensecrets: "N00000002",
      votesmart: 1002,
      fec: ["S0CA00002"],
      cspan: 1002,
      wikipedia: "Blake_Brown",
      house_history: 2002,
      ballotpedia: "Blake_Brown",
      maplight: 3002,
      icpsr: 4002,
      wikidata: "Q1002",
      google_entity_id: "/m/0def456",
      pictorial: 5002,
    },
    name: {
      first: "Blake",
      last: "Brown",
      official_full: "Blake Brown",
      nickname: "Blake",
      middle: "B",
      suffix: undefined,
    },
    bio: {
      birthday: "1975-05-15",
      gender: undefined, // Ambiguous gender
      religion: undefined, // Ambiguous religion
    },
    terms: [
      {
        type: "sen",
        start: "2021-01-03",
        end: "2027-01-03",
        state: "CA",
        district: undefined,
        party: "Democrat",
        class: 1,
        state_rank: "junior",
        url: "https://brown.senate.gov",
        address: "456 Senate St",
        office: "5678",
        phone: "202-555-0003",
        fax: "202-555-0004",
        contact_form: "https://brown.senate.gov/contact",
        rss_url: "https://brown.senate.gov/rss.xml",
        how: "election",
      },
    ],
  },
  {
    id: {
      bioguide: "C000003",
      thomas: "00345",
      govtrack: 400003,
      opensecrets: "N00000003",
      votesmart: 1003,
      fec: ["H0NY00003"],
      cspan: 1003,
      wikipedia: "Casey_Clark",
      house_history: 2003,
      ballotpedia: "Casey_Clark",
      maplight: 3003,
      icpsr: 4003,
      wikidata: "Q1003",
      google_entity_id: "/m/0ghi789",
      pictorial: 5003,
    },
    name: {
      first: "Casey",
      last: "Clark",
      official_full: "Casey Clark",
      nickname: "Casey",
      middle: "C",
      suffix: "III",
    },
    bio: {
      birthday: "1985-12-25",
      gender: undefined, // Ambiguous gender
      religion: undefined, // Ambiguous religion
    },
    terms: [
      {
        type: "rep",
        start: "2023-01-03",
        end: "2025-01-03",
        state: "NY",
        district: 2,
        party: "Independent",
        class: undefined,
        state_rank: undefined,
        url: "https://clark.house.gov",
        address: "789 House St",
        office: "9012",
        phone: "202-555-0005",
        fax: "202-555-0006",
        contact_form: "https://clark.house.gov/contact",
        rss_url: "https://clark.house.gov/rss.xml",
        how: "election",
      },
    ],
  },
  {
    id: {
      bioguide: "F000006",
      thomas: "00678",
      govtrack: 400006,
    },
    name: { first: "Single", last: "Committee", official_full: "Single Committee" },
    bio: {},
    terms: [
      {
        type: "sen",
        start: "2023-01-03",
        end: "2029-01-03",
        state: "WY",
        party: "Republican",
        district: undefined,
        class: undefined,
        state_rank: undefined,
      },
    ],
  },
];

/**
 * Mock data for legislators-social-media.yaml
 */
export const mockSocialMediaData: RawLegislatorsSocialMediaData = [
  {
    id: {
      bioguide: "A000001",
      thomas: "00123",
      govtrack: 400001,
    },
    social: {
      twitter: "alexanderson",
      facebook: "alexanderson",
      youtube: "alexanderson",
      instagram: "alexanderson",
      youtube_id: "UC123456789",
      instagram_id: "alexanderson",
      twitter_id: "123456789",
      facebook_id: "123456789",
    },
  },
  {
    id: {
      bioguide: "B000002",
      thomas: "00234",
      govtrack: 400002,
    },
    social: {
      twitter: "blakebrown",
      facebook: "blakebrown",
      youtube: "blakebrown",
      instagram: "blakebrown",
      youtube_id: "UC987654321",
      instagram_id: "blakebrown",
      twitter_id: "987654321",
      facebook_id: "987654321",
    },
  },
  {
    id: {
      bioguide: "C000003",
      thomas: "00345",
      govtrack: 400003,
    },
    social: {
      twitter: "caseyclark",
      facebook: "caseyclark",
      youtube: "caseyclark",
      instagram: "caseyclark",
      youtube_id: "UC555666777",
      instagram_id: "caseyclark",
      twitter_id: "555666777",
      facebook_id: "555666777",
    },
  },
];

/**
 * Mock data for cvc_member_data.xml (Senate members)
 */
export const mockSenateMembersData: RawSenateMemberData = {
  senators: {
    senator: [
      {
        member_full: "Blake Brown",
        party: "D",
        state: "CA",
        address: "456 Senate Building",
        bioguide_id: "B000002",
        office: "456 Russell",
        phone: "202-555-0003",
        lis_member_id: "S001",
        committees: {
          committee: [
            {
              _: "Committee on Finance",
              $: {
                code: "SSFI",
              },
            },
            {
              _: "Committee on the Judiciary",
              $: {
                code: "SSJU",
              },
            },
          ],
        },
      },
      // Single committee (object, not array) to cover mergeLegislatorData branch
      {
        member_full: "Single Committee Senator",
        party: "R",
        state: "WY",
        bioguide_id: "F000006",
        office: "789 Dirksen",
        phone: "202-555-0009",
        lis_member_id: "S002",
        committees: {
          committee: {
            _: "Committee on Appropriations",
            $: { code: "AP" },
          },
        },
      },
    ],
  },
};

/**
 * Mock data for a legislator without social media
 */
export const mockLegislatorWithoutSocial: RawLegislatorsData = [
  {
    id: {
      bioguide: "D000004",
      thomas: "00456",
      govtrack: 400004,
      opensecrets: "N00000004",
      votesmart: 1004,
      fec: ["H0TX00004"],
      cspan: 1004,
      wikipedia: "Drew_Davis",
      house_history: 2004,
      ballotpedia: "Drew_Davis",
      maplight: 3004,
      icpsr: 4004,
      wikidata: "Q1004",
      google_entity_id: "/m/0jkl012",
      pictorial: 5004,
    },
    name: {
      first: "Drew",
      last: "Davis",
      official_full: "Drew Davis",
      nickname: "Drew",
      middle: "D",
      suffix: undefined,
    },
    bio: {
      birthday: "1990-08-10",
      gender: undefined, // Ambiguous gender
      religion: undefined, // Ambiguous religion
    },
    terms: [
      {
        type: "rep",
        start: "2023-01-03",
        end: "2025-01-03",
        state: "TX",
        district: 3,
        party: "Democrat",
        class: undefined,
        state_rank: undefined,
        url: "https://davis.house.gov",
        address: "321 Texas St",
        office: "3456",
        phone: "202-555-0007",
        fax: "202-555-0008",
        contact_form: "https://davis.house.gov/contact",
        rss_url: "https://davis.house.gov/rss.xml",
        how: "election",
      },
    ],
  },
];

/**
 * Mock data for a legislator with multiple terms (to test latest term logic)
 */
export const mockLegislatorMultipleTerms: RawLegislatorsData = [
  {
    id: {
      bioguide: "E000005",
      thomas: "00567",
      govtrack: 400005,
      opensecrets: "N00000005",
      votesmart: 1005,
      fec: ["S0FL00005"],
      cspan: 1005,
      wikipedia: "Emery_Evans",
      house_history: 2005,
      ballotpedia: "Emery_Evans",
      maplight: 3005,
      icpsr: 4005,
      wikidata: "Q1005",
      google_entity_id: "/m/0mno345",
      pictorial: 5005,
    },
    name: {
      first: "Emery",
      last: "Evans",
      official_full: "Emery Evans",
      nickname: "Emery",
      middle: "E",
      suffix: undefined,
    },
    bio: {
      birthday: "1970-03-20",
      gender: undefined, // Ambiguous gender
      religion: undefined, // Ambiguous religion
    },
    terms: [
      {
        type: "sen",
        start: "2015-01-03",
        end: "2021-01-03",
        state: "FL",
        district: undefined,
        party: "Republican",
        class: 2,
        state_rank: "senior",
        url: "https://evans.senate.gov",
        address: "654 Florida St",
        office: "7890",
        phone: "202-555-0009",
        fax: "202-555-0010",
        contact_form: "https://evans.senate.gov/contact",
        rss_url: "https://evans.senate.gov/rss.xml",
        how: "election",
      },
      {
        type: "sen",
        start: "2021-01-03",
        end: "2027-01-03",
        state: "FL",
        district: undefined,
        party: "Republican",
        class: 2,
        state_rank: "senior",
        url: "https://evans.senate.gov",
        address: "654 Florida St",
        office: "7890",
        phone: "202-555-0009",
        fax: "202-555-0010",
        contact_form: "https://evans.senate.gov/contact",
        rss_url: "https://evans.senate.gov/rss.xml",
        how: "election",
      },
    ],
  },
];
