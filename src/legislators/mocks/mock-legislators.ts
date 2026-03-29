/**
 * Mock Legislators class for testing
 */
import { Legislator } from "../legislators.types.js";
import { mockLegislatorsData, mockSocialMediaData } from "./mock-data.js";

/**
 * Mock legislator data for testing - represents the merged output from Legislators.getAllLegislators()
 * Built from mock-data.ts raw sources to ensure consistency
 */
export const mockLegislatorsOutput: Legislator[] = [
  {
    bioguideId: "A000001",
    currentMember: true,
    directOrderName: "Alex Anderson",
    firstName: "Alex",
    honorificName: "Rep.",
    invertedOrderName: "Anderson, Alex",
    lastName: "Anderson",
    party: "Democrat",
    partyHistory: [{ partyAbbreviation: "D", partyName: "Democrat", startYear: 2023 }],
    state: "CA",
    terms: [],
    updateDate: "2024-01-01",
    url: "https://api.congress.gov/v3/member/A000001",
    // id property includes data from mockLegislatorsData[0].id + mockSocialMediaData[0].social + mockSocialMediaData[0].id
    id: {
      bioguide: mockLegislatorsData[0].id.bioguide, // "A000001"
      thomas: mockSocialMediaData[0].id.thomas, // "00123" (fallback from social media)
      govtrack: mockSocialMediaData[0].id.govtrack, // 400001 (fallback from social media)
      twitter: mockSocialMediaData[0].social.twitter, // "alexanderson"
      facebook: mockSocialMediaData[0].social.facebook, // "alexanderson"
      youtube: mockSocialMediaData[0].social.youtube, // "alexanderson"
      instagram: mockSocialMediaData[0].social.instagram, // "alexanderson"
      youtube_id: mockSocialMediaData[0].social.youtube_id, // "UC123456789"
      instagram_id: mockSocialMediaData[0].social.instagram_id, // "alexanderson"
      twitter_id: mockSocialMediaData[0].social.twitter_id, // "123456789"
      facebook_id: mockSocialMediaData[0].social.facebook_id, // "123456789"
    },
    name: mockLegislatorsData[0].name,
  },
];

export class MockLegislators {
  private static mockLegislators: Legislator[] = mockLegislatorsOutput;
  private static shouldThrowError: boolean = false;
  private static errorMessage: string = "Mock error";
  private static cacheClearCalled: boolean = false;

  /**
   * Mock implementation of getAllLegislators
   */
  async getAllLegislators(
    _congress?: number,
    _options?: { legislatorDataDir?: string },
  ): Promise<Legislator[]> {
    if (MockLegislators.shouldThrowError) {
      throw new Error(MockLegislators.errorMessage);
    }
    return MockLegislators.mockLegislators;
  }

  /**
   * Mock implementation of clearLegislatorsCache
   */
  clearLegislatorsCache(): void {
    if (MockLegislators.shouldThrowError) {
      throw new Error(MockLegislators.errorMessage);
    }
    MockLegislators.cacheClearCalled = true;
    console.log("Mock: Legislators cache cleared");
  }

  /**
   * Set mock legislators data
   */
  static setMockLegislators(legislators: Legislator[]): void {
    MockLegislators.mockLegislators = legislators;
  }

  /**
   * Configure mock to throw errors
   */
  static setShouldThrowError(shouldThrow: boolean, message: string = "Mock error"): void {
    MockLegislators.shouldThrowError = shouldThrow;
    MockLegislators.errorMessage = message;
  }

  /**
   * Check if cache clear was called
   */
  static wasCacheClearCalled(): boolean {
    return MockLegislators.cacheClearCalled;
  }

  /**
   * Reset all mock state
   */
  static reset(): void {
    MockLegislators.mockLegislators = mockLegislatorsOutput;
    MockLegislators.shouldThrowError = false;
    MockLegislators.errorMessage = "Mock error";
    MockLegislators.cacheClearCalled = false;
  }
}

