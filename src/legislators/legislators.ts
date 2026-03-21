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
   * Get a legislator by bioguide ID with all merged data.
   * Fetches from Congress.gov when the member list signals a row change (or cache is missing),
   * reads from cache when the list row is unchanged, or skips the API for YAML-only members.
   *
   * @param bioguideId - The member's bioguide ID
   * @param fetchHint -
   *   - `null` — skip member API (YAML-only / not on congress list).
   *   - `undefined` — no congress list context (e.g. list fetch failed); always refresh cache path.
   *   - `{ listRowChanged: true }` — refetch detail (or fill missing cache).
   *   - `{ listRowChanged: false }` — use disk cache if present; fetch only if cache missing.
   */
  async getLegislator(
    bioguideId: string,
    fetchHint?: null | undefined | { listRowChanged: boolean },
  ): Promise<Legislator | undefined> {
    await this.ensureInitialized();

    const rawLegislator = this.legislatorsMap.get(bioguideId);
    const socialMediaData = this.socialMediaMap.get(bioguideId);
    const senateMember = this.senateMembersMap.get(bioguideId);
    const social = socialMediaData?.social;
    const socialMediaIds = socialMediaData?.id;

    let memberInfo: MemberInfo | undefined;

    if (fetchHint !== null) {
      const cacheFilePath = path.join(this.getCacheDir(), 'member', `${bioguideId}.json`);
      const needsFetch = this.memberNeedsFetch(cacheFilePath, fetchHint);

      if (needsFetch) {
        try {
          const response = await this.fetchMemberInfo(bioguideId);
          memberInfo = response.member;
        } catch (error) {
          const status = (error as { status?: number })?.status;
          if (status !== 404) {
            console.warn(`Failed to fetch member info for ${bioguideId}, using cached data only`);
          }
        }
      } else {
        try {
          const parsed = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8')) as MemberResponse;
          memberInfo = parsed.member;
        } catch {
          // Cache read failed — fall back to API
          try {
            const response = await this.fetchMemberInfo(bioguideId);
            memberInfo = response.member;
          } catch (apiError) {
            const status = (apiError as { status?: number })?.status;
            if (status !== 404) {
              console.warn(`Failed to fetch member info for ${bioguideId}, using cached data only`);
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
   * Whether to call the member detail API. Driven by list-row change (not list updateDate vs cached detail).
   */
  private memberNeedsFetch(
    cacheFilePath: string,
    fetchHint: undefined | { listRowChanged: boolean },
  ): boolean {
    if (fetchHint === undefined) return true;
    if (fetchHint.listRowChanged) return true;
    return !fs.existsSync(cacheFilePath);
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
   * Shared filtering helper for by-chamber/party/state queries.
   * Iterates legislatorsMap, applies predicate to the latest YAML term, fetches full data.
   */
  private async filterAndFetchLegislators(
    predicate: (latestTerm: RawLegislatorTerm | null) => boolean,
  ): Promise<Legislator[]> {
    await this.ensureInitialized();
    const results: Legislator[] = [];
    for (const [bioguideId, rawLegislator] of this.legislatorsMap) {
      if (predicate(this.getLatestTerm(rawLegislator.terms))) {
        const legislator = await this.getLegislator(bioguideId);
        if (legislator) results.push(legislator);
      }
    }
    return results;
  }

  /** Get legislators by chamber (house or senate) */
  async getLegislatorsByChamber(chamber: "house" | "senate"): Promise<Legislator[]> {
    const type = chamber === "house" ? "rep" : "sen";
    return this.filterAndFetchLegislators((t) => t?.type === type);
  }

  /** Get legislators by party */
  async getLegislatorsByParty(party: string): Promise<Legislator[]> {
    return this.filterAndFetchLegislators((t) => t?.party === party);
  }

  /** Get legislators by state */
  async getLegislatorsByState(state: string): Promise<Legislator[]> {
    return this.filterAndFetchLegislators((t) => t?.state === state);
  }

  /**
   * Get all legislators for a given congress term.
   * Uses /member/congress/{congress} to scope the member list to that term,
   * then compares updateDate strings (like getBillsWithVotes) to decide
   * whether to fetch individual detail pages or read from cache.
   *
   * @param congress - The congressional term to fetch (defaults to this.congressionalTerm)
   */
  async getAllLegislators(congress?: number): Promise<Legislator[]> {
    await this.ensureInitialized();

    const term = congress ?? this.congressionalTerm;
    const previousUpdateDates = this.readMemberUpdateDatesCache(term);

    // Fetch the current member list for this congress to get fresh updateDates
    console.log(`Fetching member list for congress ${term}...`);
    const currentUpdateDates = new Map<string, string>();

    try {
      let offset = 0;
      const limit = 250;
      let hasMore = true;

      while (hasMore) {
        const response = await this.fetchMembersByCongress(term, { offset, limit });
        response.members.forEach((member) => {
          currentUpdateDates.set(member.bioguideId, member.updateDate);
        });
        hasMore = !!response.pagination.next;
        offset += limit;
        if (hasMore) {
          console.log(`Fetched ${offset} members, continuing...`);
        }
      }

      console.log(`Found ${currentUpdateDates.size} members in congress ${term}`);
      this.writeMemberUpdateDatesCache(term, currentUpdateDates);
    } catch (error) {
      console.warn("Failed to fetch member list, will use cached update dates:", error);
    }

    // Determine the set of bioguide IDs to process: only those returned by the congress list
    // Members absent from the congress list are YAML-only (historical) and skipped for API calls.
    const bioguideIdsToProcess = currentUpdateDates.size > 0
      ? [...currentUpdateDates.keys()]
      : [...this.legislatorsMap.keys()];

    const total = bioguideIdsToProcess.length;
    const results: Legislator[] = [];
    let fetchedCount = 0;
    let cachedCount = 0;
    let processed = 0;

    for (const bioguideId of bioguideIdsToProcess) {
      const currentUpdateDate = currentUpdateDates.get(bioguideId);
      const previousUpdateDate = previousUpdateDates.get(bioguideId);

      const fetchHint: null | undefined | { listRowChanged: boolean } =
        currentUpdateDates.size > 0
          ? {
              listRowChanged:
                previousUpdateDate === undefined || previousUpdateDate !== currentUpdateDate,
            }
          : undefined;

      if (currentUpdateDates.size > 0 && currentUpdateDate !== undefined) {
        if (previousUpdateDate === undefined || previousUpdateDate !== currentUpdateDate) {
          fetchedCount++;
        } else {
          cachedCount++;
        }
      }

      const legislator = await this.getLegislator(bioguideId, fetchHint);
      if (legislator) {
        results.push(legislator);
      }

      processed++;
      if (processed % 100 === 0 || processed === total) {
        console.log(`Processing legislators: ${processed}/${total}`);
      }
    }

    console.log(`Completed: ${fetchedCount} members fetched, ${cachedCount} loaded from cache`);
    return results;
  }

  /**
   * Reads the cached memberUpdateDates map for a given congress from disk.
   * Returns an empty map if the file does not exist.
   */
  private readMemberUpdateDatesCache(congress: number): Map<string, string> {
    const filePath = path.join(this.getCacheDir(), `memberUpdateDates-${congress}.json`);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
    } catch {
      return new Map();
    }
  }

  /**
   * Writes the memberUpdateDates map to disk for use on the next run.
   */
  private writeMemberUpdateDatesCache(congress: number, dates: Map<string, string>): void {
    const filePath = path.join(this.getCacheDir(), `memberUpdateDates-${congress}.json`);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(dates), null, 2));
    } catch (error) {
      console.warn(`Failed to write member update dates cache:`, error);
    }
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
