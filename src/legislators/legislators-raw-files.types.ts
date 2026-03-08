// Types for raw YAML and XML data from external sources

export type RawLegislatorBio = {
  birthday?: string;
  gender?: string;
  religion?: string;
};

/**
 * Raw legislator ID data from legislators-current.yaml
 */
export type RawLegislatorId = {
  bioguide: string;
  thomas?: string;
  lis?: string;
  govtrack?: number;
  opensecrets?: string;
  votesmart?: number;
  fec?: string[];
  cspan?: number;
  wikipedia?: string;
  house_history?: number;
  ballotpedia?: string;
  maplight?: number;
  icpsr?: number;
  wikidata?: string;
  google_entity_id?: string;
  pictorial?: number;
}

/**
 * Raw legislator name data from legislators-current.yaml
 */
export type RawLegislatorName = {
  first: string;
  last: string;
  official_full?: string;
  nickname?: string;
  middle?: string;
  suffix?: string;
}

/**
 * Raw legislator data from legislators-current.yaml
 * Split id and name into separate exported interfaces for reuse
 */
export type RawLegislator = {
  id: RawLegislatorId;
  name: RawLegislatorName;
  bio: RawLegislatorBio;
  terms: RawLegislatorTerm[];
}

// id and name interfaces are already exported above

/**
 * Raw term data from legislators-current.yaml
 */
export type RawLegislatorTerm = {
  type: string;
  start: string;
  end: string;
  state: string;
  district?: number;
  party: string;
  class?: number;
  state_rank?: string;
  url?: string;
  address?: string;
  office?: string;
  phone?: string;
  fax?: string;
  contact_form?: string;
  rss_url?: string;
  how?: string;
}

export type RawLegislatorSocial = {
  twitter?: string;
  facebook?: string;
  youtube?: string;
  instagram?: string;
  youtube_id?: string;
  instagram_id?: string;
  twitter_id?: string;
  facebook_id?: string;
}

/**
 * Raw social media data from legislators-social-media.yaml
 */
export type RawLegislatorSocialMedia = {
  id: {
    bioguide: string;
    thomas?: string;
    govtrack?: number;
  };
  social: RawLegislatorSocial;
}

/**
 * Raw Senate member data from cvc_member_data.xml
 * Structure from https://www.senate.gov/legislative/LIS_MEMBER/cvc_member_data.xml
 */
export type RawSenateMember = {
  member_full?: string;
  party?: string;
  state?: string;
  address?: string;
  bioguide_id?: string;
  office?: string;
  phone?: string;
  lis_member_id?: string;
  committees?: {
    committee?: RawSenateCommittee | RawSenateCommittee[];
  };
}

/**
 * Raw Senate committee data from cvc_member_data.xml
 */
export type RawSenateCommittee = {
  _?: string; // Committee name as text content
  $?: {
    code?: string;
  };
}

/**
 * Root structure of cvc_member_data.xml
 */
export type RawSenateMemberData = {
  senators?: {
    senator?: RawSenateMember[];
  };
}

/**
 * Array types for the raw YAML data
 */
export type RawLegislatorsData = RawLegislator[];
export type RawLegislatorsSocialMediaData = RawLegislatorSocialMedia[];

