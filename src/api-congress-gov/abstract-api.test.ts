import { test, describe, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import mock from "mock-fs";
import fs from "node:fs";
import fetchMock from "fetch-mock";
import { setupTestEnvironment, cleanupTestEnvironment, TEST_API_KEY } from "../test-setup.js";
import { AbstractCongressApi } from "./abstract-api.js";
import {
  mockHouseVoteListResponse,
  mockHouseVoteResponse,
  mockHouseMembersResponse,
  mockBillResponse,
  mockBillActionsResponse,
  mockBillTitlesResponse,
  mockBillListResponse,
  mockMemberResponse,
  mockMemberListResponse,
  mockSponsoredLegislationResponse,
  mockCosponsoredLegislationResponse,
  mockCommitteeListResponse,
  mockNominationListResponse,
  mockEndpointResponses,
} from "./mocks/congress-api-responses.js";

/**
 * Concrete implementation of AbstractCongressApi for testing
 * Since AbstractCongressApi is abstract, we need a concrete class to test it
 */
class TestAbstractCongressApi extends AbstractCongressApi {
  protected async initializeSpecific(): Promise<void> {
    // Mock implementation for testing
    return Promise.resolve();
  }

  // Expose protected methods for testing
  public testMakeCongressApiCall<T>(endpoint: string): Promise<T> {
    return this.makeCongressApiCall<T>(endpoint);
  }

  public testFetchHouseVotes(congress: number, session: number = 1) {
    return this.fetchHouseVotes(congress, session);
  }

  public testFetchHouseVoteDetails(congress: number, session: number, rollCallNumber: number) {
    return this.fetchHouseVoteDetails(congress, session, rollCallNumber);
  }

  public testFetchHouseVoteMembers(congress: number, session: number, rollCallNumber: number) {
    return this.fetchHouseVoteMembers(congress, session, rollCallNumber);
  }

  public testFetchBills(congress: number, params?: { offset?: number; limit?: number; fromDateTime?: string; toDateTime?: string }) {
    return this.fetchBills(congress, params);
  }

  public testFetchBillsByType(congress: number, billType: string, params?: { offset?: number; limit?: number; fromDateTime?: string; toDateTime?: string }) {
    return this.fetchBillsByType(congress, billType, params);
  }

  public testFetchBillInfo(billType: string, billNumber: string) {
    return this.fetchBillInfo(billType, billNumber);
  }

  public testFetchBillActions(billType: string, billNumber: string) {
    return this.fetchBillActions(billType, billNumber);
  }

  public testFetchBillTitles(billType: string, billNumber: string) {
    return this.fetchBillTitles(billType, billNumber);
  }

  public testFetchMemberInfo(bioguideId: string) {
    return this.fetchMemberInfo(bioguideId);
  }

  public testFetchMembers() {
    return this.fetchMembers();
  }

  public testFetchMemberSponsoredLegislation(bioguideId: string) {
    return this.fetchMemberSponsoredLegislation(bioguideId);
  }

  public testFetchMemberCosponsoredLegislation(bioguideId: string) {
    return this.fetchMemberCosponsoredLegislation(bioguideId);
  }

  public testFetchCommittees(congress: number, chamber?: 'house' | 'senate') {
    return this.fetchCommittees(congress, chamber);
  }

  public testFetchNominations(congress: number) {
    return this.fetchNominations(congress);
  }

  public testFetchSenateVotes(congress: number, year: number) {
    return this.fetchSenateVotes(congress, year);
  }

  public testEnsureInitialized() {
    return this.ensureInitialized();
  }

  public testGetApiKey() {
    return this.getApiKey();
  }

  public testGetApiBaseUrl() {
    return this.getApiBaseUrl();
  }

  public testGetCacheDir() {
    return this.getCacheDir();
  }

  public getIsInitialized() {
    return this.isInitialized;
  }
}

describe("AbstractCongressApi", () => {
  let abstractApi: TestAbstractCongressApi;

  // Set up test environment with API key before any tests run
  before(() => {
    setupTestEnvironment();
  });

  after(() => {
    cleanupTestEnvironment();
  });

  beforeEach(() => {
    fetchMock.hardReset();
    mock({});

    // Create AbstractCongressApi instance with mocks
    // Use a unique temporary directory for each test to avoid cache conflicts
    const tempDir = `/tmp/abstract-api-test-cache-${Date.now()}-${Math.random()}`;
    abstractApi = new TestAbstractCongressApi(
      119,
      fetchMock.fetchHandler as typeof fetch,
      tempDir,
    );
  });

  afterEach(() => {
    fetchMock.hardReset();
    mock.restore();
  });

  describe("constructor and configuration", () => {
    test("should initialize with default values", () => {
      const api = new TestAbstractCongressApi();
      
      assert.strictEqual(api.getCongressionalTerm(), 119);
      assert.strictEqual(api.testGetApiBaseUrl(), "https://api.congress.gov/v3");
      assert.ok(api.testGetApiKey());
      assert.ok(api.testGetCacheDir().includes(".cache/congress"));
    });

    test("should initialize with custom values", () => {
      const api = new TestAbstractCongressApi(
        118,
        fetchMock.fetchHandler as typeof fetch,
        "/tmp/custom-cache",
      );
      
      assert.strictEqual(api.getCongressionalTerm(), 118);
      assert.strictEqual(api.testGetCacheDir(), "/tmp/custom-cache");
    });

    test("should use environment API key", () => {
      const api = new TestAbstractCongressApi();
      
      // Should use the test API key from environment
      assert.strictEqual(api.testGetApiKey(), TEST_API_KEY);
    });
  });

  describe("initialization", () => {
    test("should initialize successfully", async () => {
      assert.strictEqual(abstractApi.getIsInitialized(), false);
      
      await abstractApi.initialize();
      
      assert.strictEqual(abstractApi.getIsInitialized(), true);
    });

    test("should not initialize twice", async () => {
      await abstractApi.initialize();
      assert.strictEqual(abstractApi.getIsInitialized(), true);
      
      // Second call should not change anything
      await abstractApi.initialize();
      assert.strictEqual(abstractApi.getIsInitialized(), true);
    });

    test("should ensure initialization before operations", async () => {
      assert.strictEqual(abstractApi.getIsInitialized(), false);
      
      await abstractApi.testEnsureInitialized();
      
      assert.strictEqual(abstractApi.getIsInitialized(), true);
    });
  });

  describe("makeCongressApiCall", () => {
    test("should make successful API call", async () => {
      const testData = { test: "data" };
      const endpoint = "/test-endpoint";
      
      // Mock the cached API call by setting up the expected URL
      const expectedUrl = `https://api.congress.gov/v3${endpoint}?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, testData);

      const result = await abstractApi.testMakeCongressApiCall(endpoint);
      
      assert.deepStrictEqual(result, testData);
    });

    test("should handle API errors", async () => {
      const endpoint = "/error-endpoint";
      fetchMock.catch({ throws: new Error("API Error") });

      await assert.rejects(
        () => abstractApi.testMakeCongressApiCall(endpoint),
        /API Error/
      );
    });
  });

  describe("House votes API methods", () => {
    test("should fetch House votes successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/house-vote/119/1?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockHouseVoteListResponse);

      const votes = await abstractApi.testFetchHouseVotes(119, 1);
      
      assert.ok(Array.isArray(votes));
      assert.strictEqual(votes.length, mockHouseVoteListResponse.houseRollCallVotes.length);
    });

    test("should throw error when no votes found", async () => {
      const expectedUrl = `https://api.congress.gov/v3/house-vote/119/2?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, { houseRollCallVotes: [] });

      await assert.rejects(
        () => abstractApi.testFetchHouseVotes(119, 2),
        /No votes found in the API response/
      );
    });

    test("should fetch House vote details successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/house-vote/119/1/1?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockHouseVoteResponse);

      const voteDetails = await abstractApi.testFetchHouseVoteDetails(119, 1, 1);
      
      assert.deepStrictEqual(voteDetails, mockHouseVoteResponse.houseRollCallVote);
    });

    test("should fetch House vote members successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/house-vote/119/1/1/members?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockHouseMembersResponse);

      const members = await abstractApi.testFetchHouseVoteMembers(119, 1, 1);
      
      assert.ok(Array.isArray(members));
      assert.strictEqual(members.length, mockHouseMembersResponse.houseRollCallVoteMemberVotes.results.length);
    });

    test("should handle empty member results", async () => {
      const expectedUrl = `https://api.congress.gov/v3/house-vote/119/1/2/members?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, {
        houseRollCallVoteMemberVotes: {
          congress: 119,
          identifier: 2,
          legislationNumber: "1",
          legislationType: "HR",
          legislationUrl: "https://api.congress.gov/v3/bill/119/house-bill/1",
          result: "Passed",
          results: [],
        },
      });

      // Empty results array should return empty array, not throw error
      const members = await abstractApi.testFetchHouseVoteMembers(119, 1, 2);
      assert.strictEqual(members.length, 0);
    });

    test("should throw error when member votes structure is invalid", async () => {
      const expectedUrl = `https://api.congress.gov/v3/house-vote/119/1/3/members?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, { houseRollCallVoteMemberVotes: null });

      await assert.rejects(
        () => abstractApi.testFetchHouseVoteMembers(119, 1, 3),
        /No member votes found in the members data/
      );
    });
  });

  describe("Bills API methods", () => {
    test("should fetch all bills successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockBillListResponse);

      const bills = await abstractApi.testFetchBills(119);
      
      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, mockBillListResponse.bills.length);
      assert.strictEqual(bills[0].number, "1");
      assert.strictEqual(bills[0].type, "HR");
    });

    test("should fetch bills by type successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockBillListResponse);

      const bills = await abstractApi.testFetchBillsByType(119, "HR");
      
      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, mockBillListResponse.bills.length);
    });

    test("should convert bill type to lowercase for fetchBillsByType", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockBillListResponse);

      const bills = await abstractApi.testFetchBillsByType(119, "HR");
      
      assert.ok(bills);
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should handle pagination params for fetchBills", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119?api_key=${abstractApi.testGetApiKey()}&format=json&offset=20&limit=10`;
      fetchMock.get(expectedUrl, mockBillListResponse);

      const bills = await abstractApi.testFetchBills(119, { offset: 20, limit: 10 });
      
      assert.ok(Array.isArray(bills));
    });

    test("should handle pagination params for fetchBillsByType", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${abstractApi.testGetApiKey()}&format=json&offset=20&limit=10`;
      fetchMock.get(expectedUrl, mockBillListResponse);

      const bills = await abstractApi.testFetchBillsByType(119, "HR", { offset: 20, limit: 10 });
      
      assert.ok(Array.isArray(bills));
    });

    test("should return empty array when no bills found in fetchBills", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/118?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, { bills: [] });

      const bills = await abstractApi.testFetchBills(118);
      
      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, 0);
    });

    test("should throw error when bills array is missing in fetchBills", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/117?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, { pagination: {}, request: {} });

      await assert.rejects(
        () => abstractApi.testFetchBills(117),
        /Invalid API response: bills array is missing/
      );
    });

    test("should return empty array when no bills found in fetchBillsByType", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/118/s?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, { bills: [] });

      const bills = await abstractApi.testFetchBillsByType(118, "S");
      
      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, 0);
    });

    test("should fetch bill info successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockBillResponse);

      const billInfo = await abstractApi.testFetchBillInfo("HR", "1");
      
      assert.ok(billInfo);
      assert.deepStrictEqual(billInfo, mockBillResponse);
    });

    test("should return undefined for empty parameters", async () => {
      const result1 = await abstractApi.testFetchBillInfo("", "1");
      const result2 = await abstractApi.testFetchBillInfo("HR", "");
      const result3 = await abstractApi.testFetchBillInfo("", "");
      
      assert.strictEqual(result1, undefined);
      assert.strictEqual(result2, undefined);
      assert.strictEqual(result3, undefined);
    });

    test("should handle API errors gracefully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr/999?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.catch({ throws: new Error("Bill not found") });

      const result = await abstractApi.testFetchBillInfo("HR", "999");
      
      assert.strictEqual(result, undefined);
    });

    test("should convert legislation type to lowercase", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr/2?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockBillResponse);

      const billInfo = await abstractApi.testFetchBillInfo("HR", "2");
      
      assert.ok(billInfo);
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should fetch bill actions successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${abstractApi.testGetApiKey()}&format=json&offset=0&limit=250`;
      fetchMock.get(expectedUrl, mockBillActionsResponse);

      const actionsResponse = await abstractApi.testFetchBillActions("HR", "1");
      
      assert.ok(actionsResponse);
      assert.ok(Array.isArray(actionsResponse.actions));
      assert.ok(actionsResponse.actions.length > 0);
    });

    test("should return undefined for empty parameters in bill actions", async () => {
      const result1 = await abstractApi.testFetchBillActions("", "1");
      const result2 = await abstractApi.testFetchBillActions("HR", "");
      const result3 = await abstractApi.testFetchBillActions("", "");
      
      assert.strictEqual(result1, undefined);
      assert.strictEqual(result2, undefined);
      assert.strictEqual(result3, undefined);
    });

    test("should handle API errors gracefully for bill actions", async () => {
      fetchMock.catch({ throws: new Error("Actions not found") });

      const result = await abstractApi.testFetchBillActions("HR", "999");
      
      assert.strictEqual(result, undefined);
    });

    test("should convert legislation type to lowercase for bill actions", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr/2/actions?api_key=${abstractApi.testGetApiKey()}&format=json&offset=0&limit=250`;
      fetchMock.get(expectedUrl, mockBillActionsResponse);

      const actionsResponse = await abstractApi.testFetchBillActions("HR", "2");
      
      assert.ok(actionsResponse);
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should fetch bill titles successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr/1/titles?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockBillTitlesResponse);

      const titlesResponse = await abstractApi.testFetchBillTitles("HR", "1");
      
      assert.ok(titlesResponse);
      assert.deepStrictEqual(titlesResponse, mockBillTitlesResponse);
      assert.ok(Array.isArray(titlesResponse.titles));
      assert.ok(titlesResponse.titles.length > 0);
    });

    test("should return undefined for empty parameters in bill titles", async () => {
      const result1 = await abstractApi.testFetchBillTitles("", "1");
      const result2 = await abstractApi.testFetchBillTitles("HR", "");
      const result3 = await abstractApi.testFetchBillTitles("", "");
      
      assert.strictEqual(result1, undefined);
      assert.strictEqual(result2, undefined);
      assert.strictEqual(result3, undefined);
    });

    test("should handle API errors gracefully for bill titles", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr/999/titles?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.catch({ throws: new Error("Titles not found") });

      const result = await abstractApi.testFetchBillTitles("HR", "999");
      
      assert.strictEqual(result, undefined);
    });

    test("should convert legislation type to lowercase for bill titles", async () => {
      const expectedUrl = `https://api.congress.gov/v3/bill/119/hr/2/titles?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockBillTitlesResponse);

      const titlesResponse = await abstractApi.testFetchBillTitles("HR", "2");
      
      assert.ok(titlesResponse);
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });
  });

  describe("Members API methods", () => {
    test("should fetch member info successfully", async () => {
      const bioguideId = "A000001";
      const expectedUrl = `https://api.congress.gov/v3/member/${bioguideId}?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockMemberResponse);

      const memberInfo = await abstractApi.testFetchMemberInfo(bioguideId);
      
      assert.deepStrictEqual(memberInfo, mockMemberResponse);
    });

    test("should fetch all members successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/member?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockMemberListResponse);

      const members = await abstractApi.testFetchMembers();
      
      assert.deepStrictEqual(members, mockMemberListResponse);
      assert.ok(Array.isArray(members.members));
    });

    test("should fetch member sponsored legislation successfully", async () => {
      const bioguideId = "A000001";
      const expectedUrl = `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockSponsoredLegislationResponse);

      const sponsoredLegislation = await abstractApi.testFetchMemberSponsoredLegislation(bioguideId);
      
      assert.deepStrictEqual(sponsoredLegislation, mockSponsoredLegislationResponse);
      assert.ok(Array.isArray(sponsoredLegislation.sponsoredLegislation));
      assert.strictEqual(sponsoredLegislation.sponsoredLegislation.length, 2);
    });

    test("should fetch member cosponsored legislation successfully", async () => {
      const bioguideId = "A000001";
      const expectedUrl = `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockCosponsoredLegislationResponse);

      const cosponsoredLegislation = await abstractApi.testFetchMemberCosponsoredLegislation(bioguideId);
      
      assert.deepStrictEqual(cosponsoredLegislation, mockCosponsoredLegislationResponse);
      assert.ok(Array.isArray(cosponsoredLegislation.cosponsoredLegislation));
      assert.strictEqual(cosponsoredLegislation.cosponsoredLegislation.length, 2);
    });
  });

  describe("Committees API methods", () => {
    test("should fetch all committees successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/committee/119?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockCommitteeListResponse);

      const committees = await abstractApi.testFetchCommittees(119);
      
      assert.deepStrictEqual(committees, mockCommitteeListResponse);
    });

    test("should fetch house committees successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/committee/119/house?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockCommitteeListResponse);

      const committees = await abstractApi.testFetchCommittees(119, "house");
      
      assert.deepStrictEqual(committees, mockCommitteeListResponse);
    });

    test("should fetch senate committees successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/committee/119/senate?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockCommitteeListResponse);

      const committees = await abstractApi.testFetchCommittees(119, "senate");
      
      assert.deepStrictEqual(committees, mockCommitteeListResponse);
    });
  });

  describe("Nominations API methods", () => {
    test("should fetch nominations successfully", async () => {
      const expectedUrl = `https://api.congress.gov/v3/nomination/119?api_key=${abstractApi.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockNominationListResponse);

      const nominations = await abstractApi.testFetchNominations(119);
      
      assert.deepStrictEqual(nominations, mockNominationListResponse);
    });
  });

  describe("Senate votes API methods", () => {
    test("should throw error for Senate votes (placeholder)", async () => {
      await assert.rejects(
        () => abstractApi.testFetchSenateVotes(119, 2025),
        /Senate vote fetching should be implemented by subclasses/
      );
    });
  });

  describe("error handling", () => {
    test("should handle network errors in API calls", async () => {
      fetchMock.catch({ throws: new Error("Network error") });

      await assert.rejects(
        () => abstractApi.testMakeCongressApiCall("/test"),
        /Network error/
      );
    });

    test("should handle 404 errors gracefully", async () => {
      // Unmatched URLs return 404 (fallback)
      fetchMock.catch(404);

      await assert.rejects(
        () => abstractApi.testMakeCongressApiCall("/nonexistent"),
        /Resource not found/
      );
    });
  });

  describe("caching integration", () => {
    test("should use caching for API calls", async () => {
      const endpoint = "/test-cache";
      const testData = { cached: true };
      const expectedUrl = `https://api.congress.gov/v3${endpoint}?api_key=${abstractApi.testGetApiKey()}&format=json`;
      
      fetchMock.get(expectedUrl, testData);

      // First call should hit the API
      const result1 = await abstractApi.testMakeCongressApiCall(endpoint);
      assert.deepStrictEqual(result1, testData);
      
      // Note: Actual cache testing would require more complex setup
      // This test verifies the integration point exists
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });
  });

  describe("congressional term handling", () => {
    test("should use congressional term in bill endpoints", async () => {
      const tempDir = `/tmp/abstract-api-test-cache-${Date.now()}-${Math.random()}`;
      const api = new TestAbstractCongressApi(118, fetchMock.fetchHandler as typeof fetch, tempDir);
      const expectedUrl = `https://api.congress.gov/v3/bill/118/hr/3?api_key=${api.testGetApiKey()}&format=json`;
      fetchMock.get(expectedUrl, mockBillResponse);

      await api.testFetchBillInfo("HR", "3");
      
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should return correct congressional term", () => {
      const api = new TestAbstractCongressApi(117);
      assert.strictEqual(api.getCongressionalTerm(), 117);
    });
  });
});
