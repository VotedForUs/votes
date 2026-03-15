import * as fs from "fs";
import * as path from "path";
import { makeCachedApiCall, getCacheFilePath, CachedApiCallConfig } from "../utils/fetchUtils.js";
import {
  HouseRollCallVote,
  HouseRollCallVoteDetails,
  HouseVoteMember,
  HouseVoteListResponse,
  HouseVoteResponse,
  HouseMembersResponse,
  BillResponse,
  BillActionsResponse,
  BillTitlesResponse,
  BillListResponse,
  BaseBillSummary,
  MemberResponse,
  MemberListResponse,
  SponsoredLegislationResponse,
  CosponsoredLegislationResponse,
  CommitteeListResponse,
  NominationListResponse,
} from "./abstract-api.types.js";

const API_BASE_URL = "https://api.congress.gov/v3";

/**
 * Get the Congress.gov API key from environment variable
 * Users must set CONGRESS_API_KEY environment variable
 * Get your free API key at: https://api.congress.gov/sign-up/
 */
function getApiKey(): string {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'CONGRESS_API_KEY environment variable is required. ' +
      'Get your free API key at: https://api.congress.gov/sign-up/'
    );
  }
  return apiKey;
}

/**
 * Creates a Congress.gov API configuration
 * @param apiKey - Congress.gov API key
 * @param cacheDir - Cache directory path
 * @param options - Additional options
 * @returns CachedApiCallConfig for Congress.gov
 */
function createCongressApiConfig(
  apiKey: string,
  cacheDir: string,
  options: {
    skipCache?: boolean;
  } = {},
): CachedApiCallConfig {
  return {
    baseUrl: API_BASE_URL,
    apiKey,
    cacheDir,
    format: "json",
    skipCache: options.skipCache !== undefined ? options.skipCache : false,
  };
}

/**
 * Abstract base class for Congress API operations
 * Provides common functionality for fetching raw data from api.congress.gov
 * Returns unmodified API responses - no data conversion or transformation
 * Focused purely on API interactions without legislator data management
 */
export abstract class AbstractCongressApi {
  protected congressionalTerm: number;
  protected isInitialized: boolean = false;
  protected fetchFunction: typeof fetch;
  protected apiConfig: CachedApiCallConfig;
  protected apiCallCount: number = 0;

  constructor(
    congressionalTerm: number = 119,
    fetchFunction: typeof fetch = fetch,
    cacheDir?: string,
    skipCache: boolean = false,
  ) {
    this.congressionalTerm = congressionalTerm;
    this.fetchFunction = fetchFunction;
    
    // Create Congress API configuration with caching
    const defaultCacheDir = cacheDir || path.join(process.cwd(), '.cache', 'congress');
    this.apiConfig = createCongressApiConfig(getApiKey(), defaultCacheDir, { skipCache });
  }

  /**
   * Initialize the class
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Call the specific implementation's initialization
    await this.initializeSpecific();

    this.isInitialized = true;
  }

  /**
   * Abstract method for chamber-specific initialization
   */
  protected abstract initializeSpecific(): Promise<void>;


  /**
   * Ensures the class is initialized before performing operations
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Get the congressional term
   */
  getCongressionalTerm(): number {
    return this.congressionalTerm;
  }

  /**
   * Makes a cached API call to Congress.gov with authentication and standard parameters
   * @param endpoint - The API endpoint (without base URL)
   * @param params - Optional query parameters for the API call
   * @returns Promise resolving to the parsed JSON response
   */
  protected async makeCongressApiCall<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    this.apiCallCount++;
    return makeCachedApiCall<T>(endpoint, this.apiConfig, params, this.fetchFunction);
  }

  /**
   * Get the number of API calls made
   */
  getApiCallCount(): number {
    return this.apiCallCount;
  }

  /**
   * Reset the API call counter
   */
  resetApiCallCount(): void {
    this.apiCallCount = 0;
  }

  /**
   * Get the API key (for debugging purposes)
   */
  protected getApiKey(): string {
    return this.apiConfig.apiKey;
  }

  /**
   * Get the API base URL
   */
  protected getApiBaseUrl(): string {
    return this.apiConfig.baseUrl;
  }

  /**
   * Get the cache directory
   */
  protected getCacheDir(): string {
    return this.apiConfig.cacheDir;
  }

  // ===== HOUSE VOTES API METHODS =====

  /**
   * Fetches all House votes for the congressional term
   */
  protected async fetchHouseVotes(
    congress: number,
    session: number = 1,
    params?: { offset?: number; limit?: number },
  ): Promise<HouseRollCallVote[]> {
    const endpoint = `/house-vote/${congress}/${session}`;
    const response = await this.makeCongressApiCall<HouseVoteListResponse>(endpoint, params);

    if (
      !response.houseRollCallVotes ||
      response.houseRollCallVotes.length === 0
    ) {
      throw new Error("No votes found in the API response");
    }

    return response.houseRollCallVotes;
  }

  /**
   * Fetches detailed House vote data for a specific vote
   */
  protected async fetchHouseVoteDetails(
    congress: number,
    session: number,
    rollCallNumber: number,
  ): Promise<HouseRollCallVoteDetails> {
    const endpoint = `/house-vote/${congress}/${session}/${rollCallNumber}`;
    const response = await this.makeCongressApiCall<HouseVoteResponse>(endpoint);
    return response.houseRollCallVote;
  }

  /**
   * Fetches House vote member data for a specific vote
   */
  protected async fetchHouseVoteMembers(
    congress: number,
    session: number,
    rollCallNumber: number,
  ): Promise<HouseVoteMember[]> {
    const endpoint = `/house-vote/${congress}/${session}/${rollCallNumber}/members`;
    const response = await this.makeCongressApiCall<HouseMembersResponse>(endpoint);

    if (
      !response.houseRollCallVoteMemberVotes?.results ||
      !Array.isArray(response.houseRollCallVoteMemberVotes.results)
    ) {
      throw new Error("No member votes found in the members data");
    }

    return response.houseRollCallVoteMemberVotes.results;
  }

  // ===== BILLS API METHODS =====

  /**
   * Fetches all bills for a given congress
   */
  protected async fetchBills(
    congress: number,
    params?: { offset?: number; limit?: number; fromDateTime?: string; toDateTime?: string },
  ): Promise<BaseBillSummary[]> {
    const endpoint = `/bill/${congress}`;
    const response = await this.makeCongressApiCall<BillListResponse>(endpoint, params);

    if (!response.bills || !Array.isArray(response.bills)) {
      throw new Error("Invalid API response: bills array is missing");
    }

    return response.bills;
  }

  /**
   * Fetches bills for a given congress and bill type
   */
  protected async fetchBillsByType(
    congress: number,
    billType: string,
    params?: { offset?: number; limit?: number; fromDateTime?: string; toDateTime?: string },
  ): Promise<BaseBillSummary[]> {
    const endpoint = `/bill/${congress}/${billType.toLowerCase()}`;
    const response = await this.makeCongressApiCall<BillListResponse>(endpoint, params);

    if (!response.bills || !Array.isArray(response.bills)) {
      throw new Error("Invalid API response: bills array is missing");
    }

    return response.bills;
  }

  /**
   * Fetches bill information from Congress.gov API with caching
   * Returns the raw API response
   */
  protected async fetchBillInfo(
    billType: string,
    billNumber: string,
  ): Promise<BillResponse | undefined> {
    try {
      if (!billType || !billNumber) {
        return undefined;
      }

      const endpoint = `/bill/${this.congressionalTerm}/${billType.toLowerCase()}/${billNumber}`;

      // Fetch from API (caching is handled by fetchUtils)
      const response = await this.makeCongressApiCall<BillResponse>(endpoint);

      return response;
    } catch (error) {
      console.warn(
        `Error fetching bill information for ${billType} ${billNumber}:`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Fetches bill actions from Congress.gov API with caching
   * Returns the raw API response containing all actions for the bill
   * Automatically paginates to fetch all actions if there are more than 250
   */
  protected async fetchBillActions(
    billType: string,
    billNumber: string,
    params?: { offset?: number; limit?: number },
  ): Promise<BillActionsResponse | undefined> {
    try {
      if (!billType || !billNumber) {
        return undefined;
      }

      const endpoint = `/bill/${this.congressionalTerm}/${billType.toLowerCase()}/${billNumber}/actions`;
      const pageLimit = params?.limit || 250; // Use 250 as default to get most actions in one call
      
      // Fetch first page
      const firstResponse = await this.makeCongressApiCall<BillActionsResponse>(endpoint, {
        ...params,
        offset: params?.offset || 0,
        limit: pageLimit,
      });

      if (!firstResponse?.actions) {
        return firstResponse;
      }

      // Check if we need to paginate (more actions than we got)
      const totalCount = firstResponse.pagination?.count || firstResponse.actions.length;
      let allActions = [...firstResponse.actions];

      // If there are more actions, fetch remaining pages
      if (totalCount > allActions.length && !params?.limit) {
        let currentOffset = pageLimit;
        while (allActions.length < totalCount) {
          const nextResponse = await this.makeCongressApiCall<BillActionsResponse>(endpoint, {
            offset: currentOffset,
            limit: pageLimit,
          });

          if (!nextResponse?.actions || nextResponse.actions.length === 0) {
            break;
          }

          allActions = allActions.concat(nextResponse.actions);
          currentOffset += pageLimit;
        }
      }

      const result = {
        ...firstResponse,
        actions: allActions,
      };

      // Write full response to canonical cache path (actions.json) so build-from-cache can use it
      if (!this.apiConfig.skipCache) {
        try {
          const canonicalPath = getCacheFilePath(this.apiConfig.cacheDir, endpoint);
          const dir = path.dirname(canonicalPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(canonicalPath, JSON.stringify(result, null, 2));
        } catch {
          // ignore
        }
      }

      return result;
    } catch (error) {
      console.warn(
        `Error fetching bill actions for ${billType} ${billNumber}:`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Fetches bill titles from Congress.gov API with caching
   * Returns the raw API response containing all titles for the bill
   */
  protected async fetchBillTitles(
    billType: string,
    billNumber: string,
    params?: { offset?: number; limit?: number },
  ): Promise<BillTitlesResponse | undefined> {
    try {
      if (!billType || !billNumber) {
        return undefined;
      }

      const endpoint = `/bill/${this.congressionalTerm}/${billType.toLowerCase()}/${billNumber}/titles`;

      // Fetch from API (caching is handled by fetchUtils)
      const response = await this.makeCongressApiCall<BillTitlesResponse>(endpoint, params);

      return response;
    } catch (error) {
      console.warn(
        `Error fetching bill titles for ${billType} ${billNumber}:`,
        error,
      );
      return undefined;
    }
  }

  // ===== MEMBERS API METHODS =====

  /**
   * Fetches member information by bioguide ID
   */
  protected async fetchMemberInfo(bioguideId: string, params?: Record<string, any>): Promise<MemberResponse> {
    const endpoint = `/member/${bioguideId}`;
    return this.makeCongressApiCall<MemberResponse>(endpoint, params);
  }

  /**
   * Fetches list of all members
   */
  protected async fetchMembers(params?: { currentMember?: boolean; offset?: number; limit?: number; fromDateTime?: string; toDateTime?: string }): Promise<MemberListResponse> {
    const endpoint = `/member`;
    return this.makeCongressApiCall<MemberListResponse>(endpoint, params);
  }

  /**
   * Fetches members of a specific congress term
   * Uses /member/congress/{congress} which scopes the list to that term only,
   * eliminating the need for date-range filtering on the YAML data.
   */
  protected async fetchMembersByCongress(
    congress: number,
    params?: { offset?: number; limit?: number },
  ): Promise<MemberListResponse> {
    const endpoint = `/member/congress/${congress}`;
    return this.makeCongressApiCall<MemberListResponse>(endpoint, params);
  }

  /**
   * Fetches sponsored legislation for a member by bioguide ID
   */
  protected async fetchMemberSponsoredLegislation(
    bioguideId: string,
    params?: { offset?: number; limit?: number },
  ): Promise<SponsoredLegislationResponse> {
    const endpoint = `/member/${bioguideId}/sponsored-legislation`;
    return this.makeCongressApiCall<SponsoredLegislationResponse>(endpoint, params);
  }

  /**
   * Fetches cosponsored legislation for a member by bioguide ID
   */
  protected async fetchMemberCosponsoredLegislation(
    bioguideId: string,
    params?: { offset?: number; limit?: number },
  ): Promise<CosponsoredLegislationResponse> {
    const endpoint = `/member/${bioguideId}/cosponsored-legislation`;
    return this.makeCongressApiCall<CosponsoredLegislationResponse>(endpoint, params);
  }

  // ===== COMMITTEES API METHODS =====

  /**
   * Fetches committee information
   */
  protected async fetchCommittees(
    congress: number,
    chamber?: 'house' | 'senate',
    params?: { offset?: number; limit?: number },
  ): Promise<CommitteeListResponse> {
    const endpoint = chamber 
      ? `/committee/${congress}/${chamber}`
      : `/committee/${congress}`;
    return this.makeCongressApiCall<CommitteeListResponse>(endpoint, params);
  }

  // ===== NOMINATIONS API METHODS =====

  /**
   * Fetches nomination information
   */
  protected async fetchNominations(congress: number, params?: { offset?: number; limit?: number }): Promise<NominationListResponse> {
    const endpoint = `/nomination/${congress}`;
    return this.makeCongressApiCall<NominationListResponse>(endpoint, params);
  }

  // ===== SENATE VOTES API METHODS =====

  /**
   * Placeholder for Senate vote fetching — must be implemented by subclasses
   * Senate votes are sourced from a different endpoint than House votes
   */
  protected async fetchSenateVotes(_congress: number, _year: number): Promise<never> {
    throw new Error("Senate vote fetching should be implemented by subclasses");
  }
}
