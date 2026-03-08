import { test, describe, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import { setupTestEnvironment, cleanupTestEnvironment } from "../test-setup.js";
import {
  Legislators,
  LEGISLATORS_CURRENT_URL,
  LEGISLATORS_SOCIAL_URL,
  SENATE_MEMBERS_URL,
} from "./legislators.js";
import { MockYamlUtils } from "../utils/mocks/mock-yaml-utils.js";
import { MockXmlUtils } from "../utils/mocks/mock-xml-utils.js";
import fetchMock from "fetch-mock";
import {
  mockLegislatorsData,
  mockSocialMediaData,
  mockSenateMembersData,
  mockLegislatorWithoutSocial,
  mockLegislatorMultipleTerms,
} from "./mocks/mock-data.js";

describe("Legislators", () => {
  let legislators: Legislators;

  // Set up test environment with API key before any tests run
  before(() => {
    setupTestEnvironment();
  });

  after(() => {
    cleanupTestEnvironment();
  });

  beforeEach(() => {
    // Create Legislators instance with mocks
    // Signature: (congressionalTerm, fetchFunction, cacheDir, yamlUtils, fsModule, xmlUtils)
    legislators = new Legislators(
      119,
      fetchMock.fetchHandler as typeof fetch,
      undefined, // cacheDir
      MockYamlUtils as any,
      undefined, // fsModule
      MockXmlUtils as any
    );
    MockYamlUtils.reset();
    MockXmlUtils.reset();
    fetchMock.hardReset();
  });

  afterEach(() => {
    MockYamlUtils.reset();
    MockXmlUtils.reset();
    fetchMock.hardReset();
  });

  describe("initialize", () => {
    test("should initialize successfully with mock data", async () => {
      // Set up mock data
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const A000001 = await legislators.getLegislator("A000001");
      assert.ok(A000001);
      assert.strictEqual(A000001.id?.bioguide, "A000001");
      assert.strictEqual(A000001.name?.first, "Alex");
      assert.strictEqual(A000001.name?.last, "Anderson");
    });

    test("should not reinitialize if already initialized", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();
      const firstCall = await legislators.getLegislator("A000001");

      // Second initialization should not download again
      await legislators.initialize();
      const secondCall = await legislators.getLegislator("A000001");

      assert.strictEqual(firstCall?.id?.bioguide, secondCall?.id?.bioguide);
    });

    test("should handle download errors", async () => {
      MockYamlUtils.setShouldThrowError(true, "Network error");

      await assert.rejects(() => legislators.initialize(), {
        name: "Error",
        message: "Network error",
      });
    });

    test("should merge social media data correctly into id property", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const alexAnderson = await legislators.getLegislator("A000001");

      assert.ok(alexAnderson);
      // Social media handles from RawLegislatorSocial should be in id property
      assert.strictEqual(alexAnderson.id?.twitter, "alexanderson");
      assert.strictEqual(alexAnderson.id?.facebook, "alexanderson");
      assert.strictEqual(alexAnderson.id?.youtube, "alexanderson");
      assert.strictEqual(alexAnderson.id?.instagram, "alexanderson");
      // Fallback id properties from RawLegislatorSocialMedia['id']
      assert.strictEqual(alexAnderson.id?.bioguide, "A000001");
      assert.strictEqual(alexAnderson.id?.thomas, "00123");
      assert.strictEqual(alexAnderson.id?.govtrack, 400001);
    });

    test("should merge Senate XML data correctly for senators", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const blakeBrown = await legislators.getLegislator("B000002");

      assert.ok(blakeBrown);
      // Senate data is now merged into top-level properties
      assert.strictEqual(blakeBrown.lis_member_id, "S001");
      assert.strictEqual(blakeBrown.addressInformation?.officeAddress, "456 Russell");
      assert.strictEqual(blakeBrown.addressInformation?.phoneNumber, "202-555-0003");
      assert.ok(blakeBrown.committees);
      assert.strictEqual(blakeBrown.committees.length, 2);
      assert.strictEqual(
        blakeBrown.committees[0].name,
        "Committee on Finance",
      );
      assert.strictEqual(blakeBrown.committees[0].code, "SSFI");
    });

    test("should merge Senate member with single committee (non-array)", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const singleCommittee = await legislators.getLegislator("F000006");
      assert.ok(singleCommittee);
      assert.ok(singleCommittee.committees);
      assert.strictEqual(singleCommittee.committees!.length, 1);
      assert.strictEqual(singleCommittee.committees![0].name, "Committee on Appropriations");
      assert.strictEqual(singleCommittee.committees![0].code, "AP");
    });

    test("should handle legislators without social media", async () => {
      MockYamlUtils.setMockData(
        LEGISLATORS_CURRENT_URL,
        mockLegislatorWithoutSocial,
      );
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, []);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, { senators: { senator: [] } });

      await legislators.initialize();

      const drewDavis = await legislators.getLegislator("D000004");

      assert.ok(drewDavis);
      // Social media properties should not be present when there's no social media data
      assert.strictEqual(drewDavis.id?.twitter, undefined);
      assert.strictEqual(drewDavis.id?.facebook, undefined);
    });

    test("should not have Senate data for House members", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const A000001 = await legislators.getLegislator("A000001");

      assert.ok(A000001);
      assert.strictEqual(A000001.lis_member_id, undefined);
    });
  });

  describe("getLegislator", () => {
    test("should get legislator by bioguide ID", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const A000001 = await legislators.getLegislator("A000001");
      assert.ok(A000001);
      assert.strictEqual(A000001.id?.bioguide, "A000001");
      assert.strictEqual(A000001.name?.first, "Alex");
      assert.strictEqual(A000001.name?.last, "Anderson");
    });

    test("should return undefined for non-existent bioguide ID", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const nonExistent = await legislators.getLegislator("Z999999");
      assert.strictEqual(nonExistent, undefined);
    });

    test("should include latest_term in the result", async () => {
      MockYamlUtils.setMockData(
        LEGISLATORS_CURRENT_URL,
        mockLegislatorMultipleTerms,
      );
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, []);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, { senators: { senator: [] } });

      await legislators.initialize();

      const emeryEvans = await legislators.getLegislator("E000005");

      assert.ok(emeryEvans);
      assert.ok(emeryEvans.latest_term);
      assert.strictEqual(emeryEvans.latest_term.start, "2021-01-03");
      assert.strictEqual(emeryEvans.latest_term.end, "2027-01-03");
    });

    test("should auto-initialize if not initialized", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      const A000001 = await legislators.getLegislator("A000001");
      assert.ok(A000001);
      assert.strictEqual(A000001.id?.bioguide, "A000001");
    });
  });

  describe("getLegislatorsByChamber", () => {
    test("should return house members", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const houseMembers = await legislators.getLegislatorsByChamber("house");
      assert.strictEqual(houseMembers.length, 2);
      assert.ok(
        houseMembers.every((member) => member.latest_term?.type === "rep"),
      );
    });

    test("should return senate members", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const senateMembers = await legislators.getLegislatorsByChamber("senate");
      assert.strictEqual(senateMembers.length, 2); // B000002, F000006
      assert.ok(
        senateMembers.every((member) => member.latest_term?.type === "sen"),
      );
      // Senate members should have Senate XML data merged into top-level properties
      assert.ok(senateMembers[0].lis_member_id);
      assert.strictEqual(senateMembers[0].lis_member_id, "S001");
    });
  });

  describe("getLegislatorsByParty", () => {
    test("should return legislators by party", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const republicans = await legislators.getLegislatorsByParty("Republican");
      assert.strictEqual(republicans.length, 2); // A000001, F000006
      assert.strictEqual(republicans[0].latest_term?.party, "Republican");

      const democrats = await legislators.getLegislatorsByParty("Democrat");
      assert.strictEqual(democrats.length, 1);
      assert.strictEqual(democrats[0].latest_term?.party, "Democrat");

      const independents =
        await legislators.getLegislatorsByParty("Independent");
      assert.strictEqual(independents.length, 1);
      assert.strictEqual(independents[0].latest_term?.party, "Independent");
    });
  });

  describe("getLegislatorsByState", () => {
    test("should return legislators by state", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const californiaLegislators =
        await legislators.getLegislatorsByState("CA");
      assert.strictEqual(californiaLegislators.length, 2);
      assert.ok(
        californiaLegislators.every(
          (legislator) => legislator.latest_term?.state === "CA",
        ),
      );

      const newYorkLegislators = await legislators.getLegislatorsByState("NY");
      assert.strictEqual(newYorkLegislators.length, 1);
      assert.strictEqual(newYorkLegislators[0].latest_term?.state, "NY");
    });
  });

  describe("data integrity", () => {
    test("should preserve all legislator fields", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();

      const A000001 = await legislators.getLegislator("A000001");

      assert.ok(A000001);
      assert.ok(A000001.id?.bioguide);
      assert.ok(A000001.name?.first);
      assert.ok(A000001.name?.last);
      assert.ok(A000001.name?.official_full);
      assert.ok(A000001.name?.nickname);
      assert.ok(A000001.name?.middle);
      assert.ok(A000001.name?.suffix);
      assert.ok(A000001.bio?.birthday);
      assert.ok(A000001.terms);
      assert.ok(A000001.latest_term);
      assert.ok(A000001.id?.twitter); // Social media merged into id
    });

    test("should handle missing optional fields", async () => {
      const minimalData = [
        {
          id: { bioguide: "MIN001" },
          name: { first: "Min", last: "User" },
          bio: {},
          terms: [
            {
              type: "rep",
              start: "2023-01-03",
              end: "2025-01-03",
              state: "TX",
              party: "Republican",
            },
          ],
        },
      ];

      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, minimalData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, []);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, { senators: { senator: [] } });

      await legislators.initialize();

      const minUser = await legislators.getLegislator("MIN001");

      assert.ok(minUser);
      assert.strictEqual(minUser.name?.official_full, undefined);
      assert.strictEqual(minUser.name?.nickname, undefined);
      assert.strictEqual(minUser.name?.middle, undefined);
      assert.strictEqual(minUser.name?.suffix, undefined);
      assert.strictEqual(minUser.bio?.gender, undefined);
      assert.strictEqual(minUser.bio?.birthday, undefined);
      assert.strictEqual(minUser.bio?.religion, undefined);
      assert.strictEqual(minUser.id?.twitter, undefined); // No social media data
      assert.strictEqual(minUser.lis_member_id, undefined);
    });
  });

  describe("bioguideIdFromLisMemberId", () => {
    beforeEach(async () => {
      // Set up mock data
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

      await legislators.initialize();
    });

    test("should return bioguide ID for valid LIS member ID", async () => {
      // From mock data: S001 maps to B000002 (Blake Brown)
      const bioguideId = legislators.bioguideIdFromLisMemberId("S001");
      assert.strictEqual(bioguideId, "B000002");
    });

    test("should return undefined for invalid LIS member ID", async () => {
      const bioguideId = legislators.bioguideIdFromLisMemberId("INVALID");
      assert.strictEqual(bioguideId, undefined);
    });

    test("should return undefined for empty LIS member ID", async () => {
      const bioguideId = legislators.bioguideIdFromLisMemberId("");
      assert.strictEqual(bioguideId, undefined);
    });

    test("should handle multiple LIS member ID lookups", async () => {
      // Test that map is properly populated and can handle multiple lookups
      const bioguideId1 = legislators.bioguideIdFromLisMemberId("S001");
      const bioguideId2 = legislators.bioguideIdFromLisMemberId("S001");
      
      assert.strictEqual(bioguideId1, "B000002");
      assert.strictEqual(bioguideId2, "B000002");
    });
  });

  describe("getSenateBioguideIdsWithParty", () => {
    beforeEach(async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);
      await legislators.initialize();
    });

    test("should return senators serving on the given date", () => {
      // B000002 has senate term 2021-01-03 to 2027-01-03
      const result = legislators.getSenateBioguideIdsWithParty("2024-06-15");
      assert.ok(Array.isArray(result));
      const b = result.find((r) => r.bioguideId === "B000002");
      assert.ok(b, "B000002 (Blake Brown) should be in Senate on 2024-06-15");
      assert.strictEqual(b!.party, "Democrat");
    });

    test("should return empty array for date when no senator serves", () => {
      // Before B000002's term
      const result = legislators.getSenateBioguideIdsWithParty("2018-01-01");
      assert.strictEqual(result.length, 0);
    });
  });

  describe("getHouseBioguideIdsWithParty", () => {
    beforeEach(async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);
      await legislators.initialize();
    });

    test("should return representatives serving in House on the given date", () => {
      // Mock data has reps with term 2023-01-03 to 2025-01-03
      const result = legislators.getHouseBioguideIdsWithParty("2024-06-15");
      assert.ok(Array.isArray(result));
      assert.ok(result.length > 0);
      const byId = new Map(result.map((r) => [r.bioguideId, r.party]));
      assert.ok(byId.has("A000001"), "A000001 (rep term in mock) should be in House on 2024-06-15");
      assert.ok(byId.get("A000001") === "Republican" || byId.get("A000001") === "Democrat" || byId.get("A000001"), "party should be set");
    });

    test("should return empty array for date when no representative serves", () => {
      const result = legislators.getHouseBioguideIdsWithParty("2018-01-01");
      assert.strictEqual(result.length, 0);
    });
  });

  describe("getAllLegislators with lastNCongresses", () => {
    test("should filter to legislators who served in last N congresses", async () => {
      MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
      MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);
      await legislators.initialize();

      const result = await legislators.getAllLegislators(false, { lastNCongresses: 3 });
      assert.ok(Array.isArray(result));
      // Mock data has terms in 2021-2027 range (117th–119th); all should be included
      assert.ok(result.length >= 1);
    });
  });
});
