import * as fs from "fs";
import * as path from "path";
import { AbstractCongressApi } from "../api-congress-gov/abstract-api.js";
import { MemberInfo, MemberResponse, MemberListResponse } from "../api-congress-gov/abstract-api.types.js";
import { Legislator } from "./legislators.types.js";
import {
  RawLegislator,
  RawLegislatorTerm,
  RawLegislatorsData,
  RawLegislatorsSocialMediaData,
  RawSenateMemberData,
  RawSenateMember,
  RawLegislatorSocial,
  RawLegislatorSocialMedia,
} from "./legislators-raw-files.types.js";
import { YamlUtils, YamlDownloadConfig } from "../utils/yaml-utils.js";
import { XmlUtils, XmlDownloadConfig } from "../utils/xml-utils.js";
import { CacheConfig } from "../utils/cache-config.js";
import { clearApiCache } from "../utils/fetchUtils.js";

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main";
export const LEGISLATORS_CURRENT_URL = `${GITHUB_RAW_BASE}/legislators-current.yaml`;
export const LEGISLATORS_HISTORICAL_URL = `${GITHUB_RAW_BASE}/legislators-historical.yaml`;
export const LEGISLATORS_SOCIAL_URL = `${GITHUB_RAW_BASE}/legislators-social-media.yaml`;
export const SENATE_MEMBERS_URL =
  "https://www.senate.gov/legislative/LIS_MEMBER/cvc_member_data.xml";

/**
 * Legislators class for downloading, processing, and managing legislator data
 * Extends AbstractCongressApi to leverage Congress.gov API capabilities
 */
export class Legislators extends AbstractCongressApi {
  private legislatorsMap: Map<string, RawLegislator> = new Map();
  private socialMediaMap: Map<string, any> = new Map();
  private senateMembersMap: Map<string, RawSenateMember> = new Map();
  private lisMemberIdToBioguideMap: Map<string, string> = new Map();
  private yamlUtils: typeof YamlUtils;
  protected xmlUtils: typeof XmlUtils;

  constructor(
    congressionalTerm: number = 119,
    fetchFunction: typeof fetch = fetch,
    cacheDir?: string,
    yamlUtils: typeof YamlUtils = YamlUtils,
    fsModule: typeof fs = fs,
    xmlUtils: typeof XmlUtils = XmlUtils,
    skipCache: boolean = false,
  ) {
    // Initialize parent class with default cache dir for congress API
    // This will use .cache/congress for API calls like /member/*
    super(congressionalTerm, fetchFunction, cacheDir, skipCache);
    
    this.yamlUtils = yamlUtils;
    this.xmlUtils = xmlUtils;
    // fsModule parameter kept for backward compatibility with existing code
  }

  /**
   * Implementation of abstract initializeSpecific method
   * Downloads and processes legislator data from YAML/XML sources
   * @param skipCache - Whether to skip cache and force fresh downloads
   */
  protected async initializeSpecific(skipCache: boolean = false): Promise<void> {
    console.log("Starting legislator data download and processing...");

    // Fetch legislator data from all sources
    const { legislatorsData, socialMediaData, senateMembersData} = 
      await this.fetchLegislatorDataSources(skipCache);

    console.log(`Downloaded ${legislatorsData.length} legislators (current + historical)`);
    console.log(`Downloaded ${socialMediaData.length} social media records`);
    
    const senateMembers = senateMembersData?.senators?.senator || [];
    console.log(`Downloaded ${senateMembers.length} Senate members from XML`);

    // Build maps for efficient lookup
    this.buildLegislatorMaps(legislatorsData, socialMediaData, senateMembers);

    console.log("Legislator data initialization complete.");
  }

  /**
   * Fetches legislator data from YAML and XML sources
   * @param skipCache - Whether to skip cache and force fresh downloads
   */
  private async fetchLegislatorDataSources(skipCache: boolean = false): Promise<{
    legislatorsData: RawLegislatorsData;
    socialMediaData: RawLegislatorsSocialMediaData;
    senateMembersData: RawSenateMemberData;
  }> {
    // Configure YAML downloads with caching (permanent cache) — current + historical so all members who appear in vote data are included
    const yamlDownloadConfigs: YamlDownloadConfig[] = [
      {
        url: LEGISLATORS_CURRENT_URL,
        cacheDir: CacheConfig.getLegislatorsCacheDir(),
        cacheFilename: "legislators-current.yaml",
        useCache: true,
        skipCache,
      },
      {
        url: LEGISLATORS_SOCIAL_URL,
        cacheDir: CacheConfig.getLegislatorsCacheDir(),
        cacheFilename: "legislators-social-media.yaml",
        useCache: true,
        skipCache,
      },
      {
        url: LEGISLATORS_HISTORICAL_URL,
        cacheDir: CacheConfig.getLegislatorsCacheDir(),
        cacheFilename: "legislators-historical.yaml",
        useCache: true,
        skipCache,
      },
    ];

    // Configure XML download for Senate members (permanent cache)
    const xmlDownloadConfig: XmlDownloadConfig = {
      url: SENATE_MEMBERS_URL,
      cacheDir: CacheConfig.getLegislatorsCacheDir(),
      cacheFilename: "cvc_member_data.xml",
      useCache: true,
      skipCache,
      parseXml: true,
    };

    // Download YAML and XML files in parallel
    const [
      yamlResults,
      senateMembersResult,
    ] = await Promise.all([
      this.yamlUtils.downloadMultipleYaml<
        RawLegislatorsData | RawLegislatorsSocialMediaData
      >(yamlDownloadConfigs),
      this.xmlUtils.downloadXml<RawSenateMemberData>(xmlDownloadConfig),
    ]);

    const [legislatorsCurrentResult, socialMediaResult, legislatorsHistoricalResult] = yamlResults;
    if (legislatorsCurrentResult.fromCache) {
      console.log("Legislators current data loaded from cache");
    }
    if (socialMediaResult.fromCache) {
      console.log("Social media data loaded from cache");
    }
    if (legislatorsHistoricalResult.fromCache) {
      console.log("Legislators historical data loaded from cache");
    }
    if (senateMembersResult.fromCache) {
      console.log("Senate members data loaded from cache");
    }

    const current = legislatorsCurrentResult.data as RawLegislatorsData;
    const historical = legislatorsHistoricalResult.data as RawLegislatorsData;
    // Current last so current overwrites historical for the same bioguide in buildLegislatorMaps
    const legislatorsData: RawLegislatorsData = [...historical, ...current];

    return {
      legislatorsData,
      socialMediaData: socialMediaResult.data as RawLegislatorsSocialMediaData,
      senateMembersData: senateMembersResult.data,
    };
  }

  /**
   * Builds internal maps for efficient lookup of legislator data
   */
  private buildLegislatorMaps(
    legislatorsData: RawLegislatorsData,
    socialMediaData: RawLegislatorsSocialMediaData,
    senateMembers: RawSenateMember[],
  ): void {
    // Build legislator map
    legislatorsData.forEach((legislator) => {
      if (legislator.id?.bioguide) {
        this.legislatorsMap.set(legislator.id.bioguide, legislator);
      }
    });

    // Build social media map - store full object with id and social properties
    socialMediaData.forEach((socialMedia) => {
      if (socialMedia.id?.bioguide) {
        this.socialMediaMap.set(socialMedia.id.bioguide, socialMedia);
      }
    });

    // Build senate members map
    senateMembers.forEach((senator) => {
      if (senator.bioguide_id) {
        this.senateMembersMap.set(senator.bioguide_id, senator);
      }
    });

    // Build LIS member ID to bioguide ID map for senate votes
    // First, populate from main legislators data (includes historical members)
    legislatorsData.forEach((legislator) => {
      if (legislator.id?.lis && legislator.id?.bioguide) {
        this.lisMemberIdToBioguideMap.set(legislator.id.lis, legislator.id.bioguide);
      }
    });
    
    // Then, override with Senate XML data (more current/accurate for current senators)
    senateMembers.forEach((senator) => {
      if (senator.lis_member_id && senator.bioguide_id) {
        this.lisMemberIdToBioguideMap.set(senator.lis_member_id, senator.bioguide_id);
      }
    });
  }

  /**
   * Congress N convenes Jan 3 of year 1789+2*(N-1). Returns ISO date range for that congress.
   */
  private getCongressDateRange(congress: number): { start: string; end: string } {
    const startYear = 1789 + 2 * (congress - 1);
    const endYear = startYear + 2;
    return {
      start: `${startYear}-01-03`,
      end: `${endYear}-01-03`,
    };
  }

  /**
   * Normalize YAML term date (e.g. "2021" or "2023-01-03") to ISO date for comparison.
   */
  private normalizeTermDate(dateStr: string, endOfPeriod: boolean): string {
    if (!dateStr) return endOfPeriod ? "9999-12-31" : "0001-01-01";
    if (dateStr.length === 4) return endOfPeriod ? `${dateStr}-12-31` : `${dateStr}-01-01`;
    return dateStr.length >= 7 ? dateStr.slice(0, 10) : dateStr + (endOfPeriod ? "-12-31" : "-01-01");
  }

  /**
   * True if the legislator had any term overlapping the given date range.
   */
  private legislatorServedInRange(
    raw: RawLegislator,
    rangeStart: string,
    rangeEnd: string
  ): boolean {
    if (!raw.terms?.length) return false;
    return raw.terms.some((term) => {
      const termStart = this.normalizeTermDate(term.start, false);
      const termEnd = this.normalizeTermDate(term.end, true);
      return termStart <= rangeEnd && termEnd >= rangeStart;
    });
  }

  /**
   * Gets the latest term for a legislator
   */
  private getLatestTerm(terms: RawLegislatorTerm[]): RawLegislatorTerm | null {
    if (!terms || terms.length === 0) {
      return null;
    }

    // Sort terms by start date (most recent first)
    const sortedTerms = [...terms].sort((a, b) => {
      const dateA = new Date(a.start);
      const dateB = new Date(b.start);
      return dateB.getTime() - dateA.getTime();
    });

    return sortedTerms[0];
  }

  /**
   * Get bioguide ID from LIS member ID
   * Used for mapping senate vote member IDs to bioguide IDs
   * @param lis_member_id - The LIS member ID from senate vote XML
   * @returns The bioguide ID or undefined if not found
   */
  bioguideIdFromLisMemberId(lis_member_id: string): string | undefined {
    return this.lisMemberIdToBioguideMap.get(lis_member_id);
  }

  /**
   * Merges legislator data from all sources with priority-based merging
   * Priority order: 1) MemberInfo (API), 2) RawSenateMember, 3) RawLegislatorSocial, 4) RawLegislator
   */
  mergeLegislatorData(
    memberInfo?: MemberInfo,
    rawLegislator?: RawLegislator,
    social?: RawLegislatorSocial,
    senateMember?: RawSenateMember,
    socialMediaIds?: RawLegislatorSocialMedia['id'],
  ): Legislator {
    // Start with MemberInfo as the base (highest priority)
    const legislator: Legislator = memberInfo ? { ...memberInfo } : {
      bioguideId: rawLegislator?.id?.bioguide || '',
      currentMember: true,
      directOrderName: `${rawLegislator?.name?.first} ${rawLegislator?.name?.last}`,
      firstName: rawLegislator?.name?.first || '',
      honorificName: '',
      invertedOrderName: `${rawLegislator?.name?.last}, ${rawLegislator?.name?.first}`,
      lastName: rawLegislator?.name?.last || '',
      party: '',
      partyHistory: [],
      state: '',
      terms: [],
      updateDate: new Date().toISOString(),
      url: `https://api.congress.gov/v3/member/${rawLegislator?.id?.bioguide}`,
    };

    // Add legacy YAML/XML fields
    if (rawLegislator) {
      // Start with rawLegislator.id as base
      legislator.id = { ...rawLegislator.id };
      legislator.name = rawLegislator.name;
      legislator.bio = rawLegislator.bio;
      legislator.latest_term = this.getLatestTerm(rawLegislator.terms) || undefined;
      
      // Fill in missing MemberInfo fields from rawLegislator if not present
      if (!memberInfo) {
        const latestTerm = legislator.latest_term;
        if (latestTerm) {
          legislator.party = latestTerm.party;
          legislator.state = latestTerm.state;
          legislator.district = latestTerm.district;
        }
      }
    }

    // Merge social media id fallbacks (only if properties are empty)
    if (legislator.id && socialMediaIds) {
      if (!legislator.id.thomas && socialMediaIds.thomas) {
        legislator.id.thomas = socialMediaIds.thomas;
      }
      if (!legislator.id.govtrack && socialMediaIds.govtrack) {
        legislator.id.govtrack = socialMediaIds.govtrack;
      }
    }

    // Merge social media properties into id (third priority)
    if (social && legislator.id) {
      legislator.id = {
        ...legislator.id,
        ...social,
      };
    }

    // Add Senate-specific data (second priority, overrides YAML where applicable)
    if (senateMember) {
      // Add LIS member ID
      legislator.lis_member_id = senateMember.lis_member_id;
      
      // Parse committees
      if (senateMember.committees?.committee) {
        const committeeData = senateMember.committees.committee;
        if (Array.isArray(committeeData)) {
          legislator.committees = committeeData.map((c) => ({
            name: c._,
            code: c.$?.code,
          }));
        } else {
          legislator.committees = [{
            name: committeeData._,
            code: committeeData.$?.code,
          }];
        }
      }

      // Merge address information (second priority, don't override API data)
      if (!legislator.addressInformation) {
        legislator.addressInformation = {
          city: '',
          district: '',
          officeAddress: senateMember.office || '',
          phoneNumber: senateMember.phone || '',
          zipCode: 0,
        };
      } else {
        // Only fill in missing fields
        if (!legislator.addressInformation.officeAddress && senateMember.office) {
          legislator.addressInformation.officeAddress = senateMember.office;
        }
        if (!legislator.addressInformation.phoneNumber && senateMember.phone) {
          legislator.addressInformation.phoneNumber = senateMember.phone;
        }
      }
    }

    return legislator;
  }

  /**
   * Checks if a member's cached data is up to date
   * @param bioguideId - The member's bioguide ID
   * @param updateDate - The updateDate from the member list API
   * @returns true if cache should be refreshed
   */
  private shouldRefreshMemberCache(bioguideId: string, updateDate?: string): boolean {
    if (!updateDate) {
      return true; // No update date, fetch to be safe
    }

    const cacheFilePath = path.join(this.getCacheDir(), 'member', `${bioguideId}.json`);
    
    try {
      const stats = fs.statSync(cacheFilePath);
      const cacheDate = stats.mtime;
      const apiUpdateDate = new Date(updateDate);
      
      // Return true if API data is newer than cache
      return apiUpdateDate > cacheDate;
    } catch (error) {
      // Cache file doesn't exist, needs refresh
      return true;
    }
  }

  /**
   * Get a legislator by bioguide ID with all merged data
   * Fetches from Congress.gov API first, then merges with local YAML/XML data
   * @param bioguideId - The member's bioguide ID
   * @param updateDate - Optional updateDate from member list to optimize caching.
   *   Pass `null` to explicitly skip all API calls (member is known to not be in the API).
   *   Pass `undefined` to use default cache logic (fetch if no cache exists).
   */
  async getLegislator(bioguideId: string, updateDate?: string | null): Promise<Legislator | undefined> {
    await this.ensureInitialized();

    const rawLegislator = this.legislatorsMap.get(bioguideId);
    const socialMediaData = this.socialMediaMap.get(bioguideId);
    const senateMember = this.senateMembersMap.get(bioguideId);
    const social = socialMediaData?.social;
    const socialMediaIds = socialMediaData?.id;

    let memberInfo: MemberInfo | undefined;

    // null = member is definitively not in the Congress.gov API (historical YAML-only member)
    if (updateDate !== null) {
      if (this.shouldRefreshMemberCache(bioguideId, updateDate)) {
        try {
          const response = await this.fetchMemberInfo(bioguideId);
          memberInfo = response.member;
        } catch (error) {
          // 404 is expected for former/historical members; only warn for other failures
          const status = (error as { status?: number })?.status;
          if (status !== 404) {
            console.warn(`Failed to fetch member info from API for ${bioguideId}, using cached data only`);
          }
        }
      } else {
        // Use cached data - try to read from cache
        try {
          const cacheFilePath = path.join(this.getCacheDir(), 'member', `${bioguideId}.json`);
          const cachedData = fs.readFileSync(cacheFilePath, 'utf8');
          const parsed = JSON.parse(cachedData) as MemberResponse;
          memberInfo = parsed.member;
        } catch (error) {
          // Cache read failed, fetch from API
          try {
            const response = await this.fetchMemberInfo(bioguideId);
            memberInfo = response.member;
          } catch (apiError) {
            const status = (apiError as { status?: number })?.status;
            if (status !== 404) {
              console.warn(`Failed to fetch member info from API for ${bioguideId}, using cached data only`);
            }
          }
        }
      }
    }

    if (!rawLegislator && !memberInfo) {
      return undefined;
    }

    return this.mergeLegislatorData(memberInfo, rawLegislator, social, senateMember, socialMediaIds);
  }

  /**
   * Returns the senate term that was active on the given date, or null.
   */
  private getSenateTermAtDate(terms: RawLegislatorTerm[], date: string): RawLegislatorTerm | null {
    if (!terms?.length) return null;
    const d = date.slice(0, 10);
    for (const term of terms) {
      if (term.type !== "sen") continue;
      const start = this.normalizeTermDate(term.start, false);
      const end = this.normalizeTermDate(term.end, true);
      if (start <= d && end >= d) return term;
    }
    return null;
  }

  /**
   * Returns senators serving on the given date as { bioguideId, party } from raw YAML/XML only.
   * Does not call getLegislator or the member API. Use for UC vote building in build-from-cache.
   * @param asOfDate - ISO date (e.g. action date) to determine who was in the Senate
   */
  getSenateBioguideIdsWithParty(asOfDate: string): { bioguideId: string; party: string }[] {
    const result: { bioguideId: string; party: string }[] = [];
    for (const [, raw] of this.legislatorsMap) {
      const term = this.getSenateTermAtDate(raw.terms ?? [], asOfDate);
      if (term) {
        const bioguideId = raw.id?.bioguide;
        if (bioguideId) {
          result.push({ bioguideId, party: term.party ?? "Unknown" });
        }
      }
    }
    return result;
  }

  /**
   * Returns the House term that was active on the given date, or null.
   */
  private getHouseTermAtDate(terms: RawLegislatorTerm[], date: string): RawLegislatorTerm | null {
    if (!terms?.length) return null;
    const d = date.slice(0, 10);
    for (const term of terms) {
      if (term.type !== "rep") continue;
      const start = this.normalizeTermDate(term.start, false);
      const end = this.normalizeTermDate(term.end, true);
      if (start <= d && end >= d) return term;
    }
    return null;
  }

  /**
   * Returns representatives serving in the House on the given date as { bioguideId, party } from raw YAML/XML only.
   * Does not call getLegislator or the member API. Use for voice vote building in build-from-cache.
   * @param asOfDate - ISO date (e.g. action date) to determine who was in the House
   */
  getHouseBioguideIdsWithParty(asOfDate: string): { bioguideId: string; party: string }[] {
    const result: { bioguideId: string; party: string }[] = [];
    for (const [, raw] of this.legislatorsMap) {
      const term = this.getHouseTermAtDate(raw.terms ?? [], asOfDate);
      if (term) {
        const bioguideId = raw.id?.bioguide;
        if (bioguideId) {
          result.push({ bioguideId, party: term.party ?? "Unknown" });
        }
      }
    }
    return result;
  }

  /**
   * Get legislators by chamber (house or senate)
   */
  async getLegislatorsByChamber(
    chamber: "house" | "senate",
  ): Promise<Legislator[]> {
    await this.ensureInitialized();
    const type = chamber === "house" ? "rep" : "sen";
    
    const results: Legislator[] = [];
    for (const [bioguideId, rawLegislator] of this.legislatorsMap) {
      const latestTerm = this.getLatestTerm(rawLegislator.terms);
      if (latestTerm?.type === type) {
        const legislator = await this.getLegislator(bioguideId);
        if (legislator) {
          results.push(legislator);
        }
      }
    }
    
    return results;
  }

  /**
   * Get legislators by party
   */
  async getLegislatorsByParty(party: string): Promise<Legislator[]> {
    await this.ensureInitialized();
    
    const results: Legislator[] = [];
    for (const [bioguideId, rawLegislator] of this.legislatorsMap) {
      const latestTerm = this.getLatestTerm(rawLegislator.terms);
      if (latestTerm?.party === party) {
        const legislator = await this.getLegislator(bioguideId);
        if (legislator) {
          results.push(legislator);
        }
      }
    }
    
    return results;
  }

  /**
   * Get legislators by state
   */
  async getLegislatorsByState(state: string): Promise<Legislator[]> {
    await this.ensureInitialized();
    
    const results: Legislator[] = [];
    for (const [bioguideId, rawLegislator] of this.legislatorsMap) {
      const latestTerm = this.getLatestTerm(rawLegislator.terms);
      if (latestTerm?.state === state) {
        const legislator = await this.getLegislator(bioguideId);
        if (legislator) {
          results.push(legislator);
        }
      }
    }
    
    return results;
  }

  /**
   * Get all legislators with optimized caching
   * Fetches member list first to check update dates, only fetches detail pages for updated members
   * @param currentMember - When true, member list is filtered to current members (for update-date checks only)
   * @param options - Optional. lastNCongresses: only include legislators who served in the last N congresses (e.g. 3 for 117–119)
   */
  async getAllLegislators(
    currentMember: boolean = true,
    options?: { lastNCongresses?: number }
  ): Promise<Legislator[]> {
    await this.ensureInitialized();

    const lastNCongresses = options?.lastNCongresses;

    // Optionally restrict to legislators who served in the last N congresses (by term dates in YAML)
    let bioguideIdsToProcess: Iterable<string>;
    let total: number;
    if (lastNCongresses != null && lastNCongresses > 0) {
      const startCongress = Math.max(1, this.congressionalTerm - lastNCongresses + 1);
      const rangeStart = this.getCongressDateRange(startCongress).start;
      const rangeEnd = this.getCongressDateRange(this.congressionalTerm).end;
      const filtered: string[] = [];
      for (const [id, raw] of this.legislatorsMap) {
        if (this.legislatorServedInRange(raw, rangeStart, rangeEnd)) filtered.push(id);
      }
      bioguideIdsToProcess = filtered;
      total = filtered.length;
      console.log(
        `Filtering to legislators who served in congresses ${startCongress}-${this.congressionalTerm} (${total} of ${this.legislatorsMap.size})`
      );
    } else {
      bioguideIdsToProcess = this.legislatorsMap.keys();
      total = this.legislatorsMap.size;
    }

    // Fetch member list to get update dates for smart caching
    console.log("Fetching member list to check for updates...");
    const memberUpdateDates = new Map<string, string>();

    try {
      let offset = 0;
      const limit = 250; // Max allowed by API
      let hasMore = true;

      while (hasMore) {
        const response = await this.fetchMembers({
          currentMember,
          offset,
          limit,
        });

        // Store update dates
        response.members.forEach((member) => {
          memberUpdateDates.set(member.bioguideId, member.updateDate);
        });

        // Check if there are more pages
        hasMore = !!response.pagination.next;
        offset += limit;

        if (hasMore) {
          console.log(`Fetched ${offset} members, continuing...`);
        }
      }

      console.log(`Checked ${memberUpdateDates.size} members for updates`);
    } catch (error) {
      console.warn("Failed to fetch member list, will fetch all member details:", error);
    }

    const results: Legislator[] = [];
    let fetchedCount = 0;
    let cachedCount = 0;
    let processed = 0;

    for (const bioguideId of bioguideIdsToProcess) {
      // When the member list was successfully fetched, members absent from it are
      // historical YAML-only members that will 404 on the API — pass null to skip
      // the API call entirely. When the list fetch failed (size === 0), fall back
      // to undefined so the existing "fetch to be safe" logic applies.
      const updateDate: string | null | undefined = memberUpdateDates.size > 0
        ? (memberUpdateDates.has(bioguideId) ? memberUpdateDates.get(bioguideId) : null)
        : memberUpdateDates.get(bioguideId);

      if (updateDate !== null) {
        if (this.shouldRefreshMemberCache(bioguideId, updateDate)) {
          fetchedCount++;
        } else {
          cachedCount++;
        }
      }

      const legislator = await this.getLegislator(bioguideId, updateDate);
      if (legislator) {
        results.push(legislator);
      }

      processed++;
      if (processed % 500 === 0 || processed === total) {
        console.log(`Processing legislators: ${processed}/${total}`);
      }
    }

    console.log(`Completed: ${fetchedCount} members fetched, ${cachedCount} loaded from cache`);
    
    return results;
  }

  /**
   * Find legislator by bioguide ID (alias for getLegislator)
   */
  async findLegislatorByBioguideId(
    bioguideId: string,
  ): Promise<Legislator | undefined> {
    return this.getLegislator(bioguideId);
  }

  /**
   * Clears all cached legislator data
   * - YAML cache (legislators-current, legislators-historical, legislators-social-media)
   * - XML cache (cvc_member_data.xml)
   * - Congress API cache for /member/* endpoints
   */
  clearLegislatorsCache(): void {
    console.log("Clearing legislators cache...");
    
    const legislatorsCacheDir = CacheConfig.getLegislatorsCacheDir();
    YamlUtils.clearCache(legislatorsCacheDir, LEGISLATORS_CURRENT_URL);
    YamlUtils.clearCache(legislatorsCacheDir, LEGISLATORS_HISTORICAL_URL);
    YamlUtils.clearCache(legislatorsCacheDir, LEGISLATORS_SOCIAL_URL);
    
    // Clear XML cache file
    XmlUtils.clearCache(legislatorsCacheDir, SENATE_MEMBERS_URL);
    
    // Clear Congress API cache for /member/* endpoints
    const congressCacheDir = this.getCacheDir();
    clearApiCache(congressCacheDir, "member");
    
    console.log("Legislators cache cleared successfully.");
  }
}
