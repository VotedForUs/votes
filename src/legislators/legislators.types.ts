// Domain types for legislator data output

import { MemberInfo } from "../api-congress-gov/abstract-api.types.js";
import { 
  RawLegislatorBio, 
  RawLegislatorTerm, 
  RawLegislatorSocial,
  RawLegislatorId,
  RawLegislatorName,
} from "./legislators-raw-files.types.js";

export type LegislatorBio = RawLegislatorBio & {
  lis_member_id?: string;
  address?: string;
  office?: string;
  phone?: string;
}

/**
 * Legislator ID type that combines:
 * - RawLegislatorId (from legislators-current.yaml)
 * - RawLegislatorSocial (social media properties)
 * - Fallback id properties from RawLegislatorSocialMedia['id']
 */
export type LegislatorId = RawLegislatorId & RawLegislatorSocial & {
  bioguide: string; // required, from RawLegislatorId
  // thomas, govtrack from RawLegislatorId, can be overridden by social media fallback
}

/**
 * Legislator type representing merged data from all sources
 * This combines data from:
 * - api.congress.gov /member endpoint (MemberInfo) - highest priority
 * - cvc_member_data.xml (for senators only) - second priority
 * - legislators-social-media.yaml - third priority
 * - legislators-current.yaml - lowest priority
 * 
 * Extends MemberInfo with additional legacy fields from YAML/XML sources
 */
export type Legislator = MemberInfo & {
  // Legacy fields from YAML/XML that may not be in MemberInfo
  id?: LegislatorId;
  name?: RawLegislatorName;
  bio?: LegislatorBio;
  latest_term?: RawLegislatorTerm;
  
  // Senate LIS member ID (blank for House members)
  lis_member_id?: string;
  
  // Committees (merged from both API and Senate XML)
  committees?: Array<{
    name?: string;
    code?: string;
  }>;
}

export type LegislatorSmall = {
  id: string;
  bioguide: string;
  name?: string;
  lastName?: string;
  state?: string;
  party?: string;
  district?: number;
  nameTitle: string;
  attribution?: string;
  imageUrl?: string;
  stateRank?: string;
  type?: string;
  lis_member_id?: string;
}