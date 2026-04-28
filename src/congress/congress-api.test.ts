import { test, describe, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import mock from "mock-fs";
import fs from "node:fs";
import fetchMock from "fetch-mock";
import { setupTestEnvironment, cleanupTestEnvironment, TEST_API_KEY } from "../test-setup.js";
import { CongressApi, shouldKeepAction, computeBillDateFields, getBillState, isBillRejectedOrDead, isVotePassed } from "./congress-api.js";
import { getCacheFilePath } from "../utils/fetchUtils.js";
import { MockYamlUtils } from "../utils/mocks/mock-yaml-utils.js";
import { MockXmlUtils } from "../utils/mocks/mock-xml-utils.js";
import { mockLegislatorsData, mockSocialMediaData, mockSenateMembersData } from "../legislators/mocks/mock-data.js";
import {
  mockCongressVoteListResponse,
  mockCongressHouseVoteResponse,
  mockHouseVoteResponse,
  mockCongressMembersResponse,
  mockCongressBillResponse,
  mockBillActionsResponse,
  mockBillWithActions,
  mockBillListResponse,
  mockBillActionsWithoutChamberVotes,
  mockBillActionsResponseWithLibraryOfCongress,
} from "../api-congress-gov/mocks/congress-api-responses.js";
import { LEGISLATORS_CURRENT_URL, LEGISLATORS_SOCIAL_URL, SENATE_MEMBERS_URL } from "../legislators/legislators.js";

// Mock senate roll call vote XML data
// Structure matches actual XML parsed by fast-xml-parser
const mockSenateRollCallVoteXml = {
  roll_call_vote: {
    congress: "119",
    session: "1",
    congress_year: "2025",
    vote_number: "372",
    vote_date: "July 1, 2025",
    modify_date: "July 2, 2025",
    vote_question_text: "On Passage of the Bill",
    vote_result_text: "Bill Passed",
    vote_result: "Passed",
    question: "On Passage of the Bill",
    vote_title: "H.R. 1",
    majority_requirement: "1/2",
    count: {
      yeas: "51",
      nays: "50",
      present: "0",
      absent: "0",
    },
    members: {
      member: [
        {
          member_full: "Blake Brown",
          last_name: "Brown",
          first_name: "Blake",
          party: "D",
          state: "NY",
          vote_cast: "Yea",
          lis_member_id: "S001", // Maps to B000002 (Blake Brown) in mock data
        },
      ],
    },
  },
};

// Mock bill actions response with senate vote
const mockBillActionsWithSenateVote = {
  actions: [
    {
      actionCode: "S9000",
      actionDate: "2025-07-01",
      text: "Passed Senate with an amendment by Yea-Nay Vote. 50 - 50. Record Vote Number: 372.",
      type: "Floor",
      recordedVotes: [
        {
          chamber: "Senate",
          congress: 119,
          date: "2025-07-01T13:00:00Z",
          rollNumber: 372,
          sessionNumber: 1,
          url: "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00372.xml",
        },
      ],
    },
    {
      actionCode: "1000",
      actionDate: "2025-01-03",
      text: "Introduced in Senate",
      type: "IntroReferral",
    },
  ],
};

describe("computeBillDateFields", () => {
  test("should return lastActionDate and lastRecordedVoteDate from actions", () => {
    const actions = [
      { actionDate: "2025-01-10", recordedVotes: [{ date: "2025-01-10T12:00:00Z" }] },
      { actionDate: "2025-01-15", recordedVotes: [{ date: "2025-01-15T14:00:00Z" }] },
      { actionDate: "2025-01-12" },
    ];
    const result = computeBillDateFields(actions as any);
    assert.strictEqual(result.lastActionDate, "2025-01-15");
    assert.strictEqual(result.lastRecordedVoteDate, "2025-01-15T14:00:00Z");
  });

  test("should use action.actionDate when vote has no date", () => {
    const actions = [
      { actionDate: "2025-02-01", recordedVotes: [{}] },
    ];
    const result = computeBillDateFields(actions as any);
    assert.strictEqual(result.lastRecordedVoteDate, "2025-02-01");
  });

  test("should return undefined when actions empty", () => {
    const result = computeBillDateFields([]);
    assert.strictEqual(result.lastActionDate, undefined);
    assert.strictEqual(result.lastRecordedVoteDate, undefined);
  });
});

describe("shouldKeepAction", () => {
  test("should keep non-Library of Congress actions", () => {
    assert.strictEqual(shouldKeepAction({ sourceSystem: { name: "House floor actions" } }), true);
    assert.strictEqual(shouldKeepAction({ sourceSystem: { name: "Senate" } }), true);
  });

  test("should keep Library of Congress President and BecameLaw", () => {
    assert.strictEqual(
      shouldKeepAction({ sourceSystem: { name: "Library of Congress" }, type: "President" }),
      true
    );
    assert.strictEqual(
      shouldKeepAction({ sourceSystem: { name: "Library of Congress" }, type: "BecameLaw" }),
      true
    );
  });

  test("should exclude other Library of Congress actions", () => {
    assert.strictEqual(
      shouldKeepAction({ sourceSystem: { name: "Library of Congress" }, type: "Floor" }),
      false
    );
    assert.strictEqual(
      shouldKeepAction({ sourceSystem: { name: "Library of Congress" }, type: "IntroReferral" }),
      false
    );
  });
});

describe("getBillState", () => {
  test("returns becameLaw when latestAction indicates became law", () => {
    assert.strictEqual(
      getBillState({ latestAction: { text: "Became Public Law No: 119-1." } }),
      "becameLaw"
    );
    assert.strictEqual(
      getBillState({ latestAction: { text: "Signed by President." } }),
      "becameLaw"
    );
  });

  test("returns rejected for failed passage, vetoed, override failed, procedural rejection", () => {
    assert.strictEqual(
      getBillState({ latestAction: { text: "Failed of passage in Senate by Yea-Nay Vote. 50 - 50." } }),
      "rejected"
    );
    assert.strictEqual(getBillState({ latestAction: { text: "Vetoed by President." } }), "rejected");
    assert.strictEqual(
      getBillState({ latestAction: { text: "Motion to proceed to consideration of measure rejected in Senate." } }),
      "rejected"
    );
    assert.strictEqual(
      getBillState({
        latestAction: {
          text: "Motion to discharge Senate Committee on Foreign Relations rejected by Yea-Nay Vote.",
        },
      }),
      "rejected"
    );
  });

  test("returns inProgress for passage or other non-final actions", () => {
    assert.strictEqual(
      getBillState({ latestAction: { text: "Passed/agreed to in House" } }),
      "inProgress"
    );
    assert.strictEqual(
      getBillState({ latestAction: { text: "Presented to President" } }),
      "inProgress"
    );
    assert.strictEqual(
      getBillState({ latestAction: { text: "Referred to the Committee on Ways and Means" } }),
      "inProgress"
    );
    assert.strictEqual(getBillState({}), "inProgress");
    assert.strictEqual(getBillState({ latestAction: { text: "" } }), "inProgress");
  });
});

describe("isBillRejectedOrDead", () => {
  test("returns true for failed passage", () => {
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Failed of passage in Senate by Yea-Nay Vote. 50 - 50." } }),
      true
    );
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Failed of passage/not agreed to in House" } }),
      true
    );
  });

  test("returns true for vetoed bills", () => {
    assert.strictEqual(isBillRejectedOrDead({ latestAction: { text: "Vetoed by President." } }), true);
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Pocket vetoed by President" } }),
      true
    );
  });

  test("returns true for override attempt failed", () => {
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Override attempt failed in House." } }),
      true
    );
  });

  test("returns true for motion to proceed rejected", () => {
    assert.strictEqual(
      isBillRejectedOrDead({
        latestAction: {
          text: "Motion to proceed to consideration of measure rejected in Senate by Yea-Nay Vote. 36 - 62.",
        },
      }),
      true
    );
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Motion to proceed rejected" } }),
      true
    );
  });

  test("returns true for motion to discharge rejected", () => {
    assert.strictEqual(
      isBillRejectedOrDead({
        latestAction: {
          text: "Motion to discharge Senate Committee on Foreign Relations rejected by Yea-Nay Vote.",
        },
      }),
      true
    );
  });

  test("returns true for cloture motion rejected", () => {
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Cloture motion rejected in Senate." } }),
      true
    );
  });

  test("returns false when latestAction indicates passage or in progress", () => {
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Passed/agreed to in House" } }),
      false
    );
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Became Public Law No: 119-1." } }),
      false
    );
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Motion to proceed agreed to" } }),
      false
    );
    assert.strictEqual(
      isBillRejectedOrDead({ latestAction: { text: "Referred to the Committee on Ways and Means" } }),
      false
    );
  });

  test("returns false when latestAction is missing or empty", () => {
    assert.strictEqual(isBillRejectedOrDead({}), false);
    assert.strictEqual(isBillRejectedOrDead({ latestAction: {} }), false);
    assert.strictEqual(isBillRejectedOrDead({ latestAction: { text: "" } }), false);
  });
});

describe("isVotePassed", () => {
  test("returns true for normalized passed and raw pass-like strings", () => {
    assert.strictEqual(isVotePassed("passed"), true);
    assert.strictEqual(isVotePassed("Passed"), true);
    assert.strictEqual(isVotePassed("Passed by Unanimous Consent"), true);
    assert.strictEqual(isVotePassed("Agreed to"), true);
    assert.strictEqual(isVotePassed("Adopted"), true);
  });

  test("returns false for normalized rejected and raw reject-like strings", () => {
    assert.strictEqual(isVotePassed("rejected"), false);
    assert.strictEqual(isVotePassed("Failed"), false);
    assert.strictEqual(isVotePassed("Rejected"), false);
  });

  test("returns false for missing or empty", () => {
    assert.strictEqual(isVotePassed(undefined), false);
    assert.strictEqual(isVotePassed(""), false);
    assert.strictEqual(isVotePassed("   "), false);
  });
});

describe("CongressApi", () => {
  let congressApi: CongressApi;
  let tempDir: string;

  // Set up test environment with API key before any tests run
  before(() => {
    setupTestEnvironment();
  });

  after(() => {
    cleanupTestEnvironment();
  });

  beforeEach(() => {
    fetchMock.hardReset();
    MockYamlUtils.reset();
    MockXmlUtils.reset();
    mock({});

    // Set up default mock data for legislators
    MockYamlUtils.setMockData(LEGISLATORS_CURRENT_URL, mockLegislatorsData);
    MockYamlUtils.setMockData(LEGISLATORS_SOCIAL_URL, mockSocialMediaData);
    MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);

    // Create CongressApi instance with mocks
    // Use a unique temporary directory for each test to avoid cache conflicts
    tempDir = `/tmp/congress-api-test-cache-${Date.now()}-${Math.random()}`;
    congressApi = new CongressApi(
      119,
      fetchMock.fetchHandler as typeof fetch,
      tempDir,
      MockYamlUtils as any,
      fs,
      MockXmlUtils as any,
    );
  });

  afterEach(() => {
    fetchMock.hardReset();
    MockYamlUtils.reset();
    MockXmlUtils.reset();
    mock.restore();
  });

  describe("constructor and initialization", () => {
    test("should initialize with default values", () => {
      const api = new CongressApi();
      
      assert.strictEqual(api.getCongressionalTerm(), 119);
    });

    test("should initialize with custom values", () => {
      const tempDir = `/tmp/custom-cache-${Date.now()}`;
      const api = new CongressApi(
        118,
        fetchMock.fetchHandler as typeof fetch,
        tempDir,
        MockYamlUtils as any,
        fs,
        MockXmlUtils as any,
      );
      
      assert.strictEqual(api.getCongressionalTerm(), 118);
    });

    test("should initialize successfully", async () => {
      await congressApi.initialize();
      
      // Should be initialized after calling initialize
      assert.ok(true); // If we get here without error, initialization worked
    });
  });

  describe("getLegislator method", () => {
    test("should get member by bioguide ID", async () => {
      const bioguideId = "A000001";
      
      const member = await congressApi.getLegislator(bioguideId);
      
      assert.ok(member);
      assert.strictEqual(member.id?.bioguide, bioguideId);
      assert.strictEqual(member.name?.first, "Alex");
      assert.strictEqual(member.name?.last, "Anderson");
    });

    test("should return undefined for non-existent bioguide ID", async () => {
      const bioguideId = "NONEXISTENT";
      
      const member = await congressApi.getLegislator(bioguideId);
      
      assert.strictEqual(member, undefined);
    });

    test("should handle empty bioguide ID", async () => {
      const member = await congressApi.getLegislator("");
      
      assert.strictEqual(member, undefined);
    });
  });

  describe("getBill method", () => {
    test("should get complete bill with all actions (default includeActions='all')", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsResponse);

      const billWithActions = await congressApi.getBill("HR", "1");

      assert.ok(billWithActions);
      // getBill returns BillWithActions directly, not wrapped in { bill }
      assert.ok(billWithActions.actions);
      assert.ok(Array.isArray(billWithActions.actions.actions));
      // Should return all actions when includeActions='all' (default), excluding LoC except President/BecameLaw
      const keptCount = mockBillActionsResponse.actions.filter(
        (a: { sourceSystem?: { name?: string }; type?: string }) => shouldKeepAction(a)
      ).length;
      assert.strictEqual(billWithActions.actions.actions.length, keptCount);
      assert.strictEqual(billWithActions.title, "Test Bill for Congress API");
      assert.strictEqual(billWithActions.number, "1");
      assert.strictEqual(billWithActions.type, "HR");
    });

    test("should return basic bill info when includeActions='none'", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);

      const billWithActions = await congressApi.getBill("HR", "1", 'none');

      assert.ok(billWithActions);
      // Should return basic bill info (BaseBillSummary) without actions processing
      assert.strictEqual(billWithActions.title, "Test Bill for Congress API");
      assert.strictEqual(billWithActions.number, "1");
      assert.strictEqual(billWithActions.type, "HR");
      
      // latestAction should still be present from the base bill response
      assert.ok(billWithActions.latestAction);
      assert.strictEqual(billWithActions.latestAction.text, "Passed House");
    });

    test("should return undefined for non-existent bill", async () => {
      fetchMock.catch({ throws: new Error("Bill not found") });

      const billWithActions = await congressApi.getBill("HR", "999");
      assert.strictEqual(billWithActions, undefined);
    });

    test("should handle empty parameters", async () => {
      const result1 = await congressApi.getBill("", "1");
      const result2 = await congressApi.getBill("HR", "");
      const result3 = await congressApi.getBill("", "");
      
      assert.strictEqual(result1, undefined);
      assert.strictEqual(result2, undefined);
      assert.strictEqual(result3, undefined);
    });

    test("should handle bill with no actions", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/2?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/2/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, { actions: [] });

      const billWithActions = await congressApi.getBill("HR", "2");

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      assert.ok(Array.isArray(billWithActions.actions.actions));
      assert.strictEqual(billWithActions.actions.actions.length, 0);
    });

    test("should handle actions fetch failure gracefully", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/3?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/3/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, {} as any); // Simulate actions fetch failure

      const billWithActions = await congressApi.getBill("HR", "3");

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      assert.ok(Array.isArray(billWithActions.actions.actions));
      assert.strictEqual(billWithActions.actions.actions.length, 0); // Should default to empty array
    });

    test("should not fetch senate chamber votes when includeVotes=false (default)", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/s/1?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/s/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Reset MockXmlUtils to clear any error state
      MockXmlUtils.reset();
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);
      
      // Ensure legislators are initialized (which builds the LIS member ID map)
      await congressApi.initialize();
      
      // Set up mock responses
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsWithSenateVote);

      const billWithActions = await congressApi.getBill("S", "1");

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      // When includeVotes=false, recordedVotes should not have votes property populated
      if (billWithActions.actions.actions.length > 0) {
        const action = billWithActions.actions.actions[0];
        if (action.recordedVotes && action.recordedVotes.length > 0) {
          assert.strictEqual(action.recordedVotes[0].votes, undefined);
        }
      }
    });

    test("should handle senate vote with missing bioguide mapping when includeVotes=true", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/s/2?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/s/2/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const senateVoteUrl = "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00372.xml";
      
      // Reset MockXmlUtils to clear any error state
      MockXmlUtils.reset();
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);
      
      // Ensure legislators are initialized
      await congressApi.initialize();
      
      // Mock XML with invalid LIS member ID
      const mockSenateVoteWithInvalidId = {
        roll_call_vote: {
          congress: "119",
          session: "1",
          vote_number: "372",
          vote_date: "July 1, 2025",
          vote_question_text: "On Passage",
          vote_result_text: "Passed",
          vote_result: "Passed",
          count: {
            yeas: "1",
            nays: "0",
            present: "0",
            absent: "0",
          },
          members: {
            member: [
              {
                member_full: "Unknown Senator",
                last_name: "Senator",
                first_name: "Unknown",
                party: "I",
                state: "XX",
                vote_cast: "Yea",
                lis_member_id: "INVALID", // No mapping exists
              },
            ],
          },
        },
      };
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsWithSenateVote);
      MockXmlUtils.setMockData(senateVoteUrl, mockSenateVoteWithInvalidId);

      const billWithActions = await congressApi.getBill("S", "2", 'all', true);

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      assert.ok(billWithActions.actions.actions.length > 0);
      // Check that the action has recorded votes with empty votes object
      const action = billWithActions.actions.actions[0];
      if (action.recordedVotes && action.recordedVotes.length > 0) {
        const recordedVote = action.recordedVotes[0];
        assert.ok(recordedVote.votes);
        assert.strictEqual(Object.keys(recordedVote.votes).length, 0);
      }
    });

    test("should handle senate vote XML fetch failure gracefully when includeVotes=true", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/s/3?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/s/3/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Reset and set error state
      MockXmlUtils.reset();
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);
      
      // Ensure legislators are initialized
      await congressApi.initialize();
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsWithSenateVote);
      MockXmlUtils.setShouldThrowError(true, "XML fetch failed");

      const billWithActions = await congressApi.getBill("S", "3", 'all', true);

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      // Should handle error gracefully - votes property should not be set on recordedVotes
      if (billWithActions.actions.actions.length > 0) {
        const action = billWithActions.actions.actions[0];
        if (action.recordedVotes && action.recordedVotes.length > 0) {
          // Error should be caught and votes not populated
          assert.strictEqual(action.recordedVotes[0].votes, undefined);
        }
      }
    });

    test("should handle malformed senate vote XML when includeVotes=true", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/s/4?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/s/4/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const senateVoteUrl = "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00372.xml";
      
      // Malformed XML structure
      const mockMalformedXml = {
        roll_call_vote: {
          // Missing members array
        },
      };
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsWithSenateVote);
      MockXmlUtils.setMockData(senateVoteUrl, mockMalformedXml);

      const billWithActions = await congressApi.getBill("S", "4", 'all', true);

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      // Should handle malformed XML gracefully - votes property should not be set
      if (billWithActions.actions.actions.length > 0) {
        const action = billWithActions.actions.actions[0];
        if (action.recordedVotes && action.recordedVotes.length > 0) {
          assert.strictEqual(action.recordedVotes[0].votes, undefined);
        }
      }
    });

    test("should handle senate vote URL parsing failure", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/s/5?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/s/5/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Invalid URL format in recorded vote
      const mockActionsWithBadUrl = {
        actions: [
          {
            actionCode: "S9000",
            actionDate: "2025-07-01",
            text: "Passed Senate",
            type: "Floor",
            recordedVotes: [
              {
                chamber: "Senate",
                congress: 119,
                date: "2025-07-01T13:00:00Z",
                rollNumber: 372,
                sessionNumber: 1,
                url: "https://invalid-url-format.com", // Invalid URL
              },
            ],
          },
        ],
      };
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockActionsWithBadUrl);

      const billWithActions = await congressApi.getBill("S", "5");

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      // Should handle URL parsing failure gracefully - actions should still be present
      assert.ok(billWithActions.actions.actions.length > 0);
    });

    test("should not fetch votes when includeVotes=false (default)", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsResponse);

      const billWithActions = await congressApi.getBill("HR", "1", 'all', false);

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      // Should have actions but votes property should not be populated on recordedVotes
      if (billWithActions.actions.actions.length > 0) {
        const action = billWithActions.actions.actions[0];
        if (action.recordedVotes && action.recordedVotes.length > 0) {
          assert.strictEqual(action.recordedVotes[0].votes, undefined);
        }
      }
      
      // Should not have called the members endpoint
      // Verify members endpoint was not called by checking MockFetch didn't receive that URL
      assert.strictEqual(fetchMock.callHistory.calls().length, 3); // bill, actions, and titles
    });

    test("should fetch votes when includeVotes=true", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const titlesUrl = `https://api.congress.gov/v3/bill/119/hr/1/titles?api_key=${apiKey}&format=json`;
      const voteDetailsUrl = `https://api.congress.gov/v3/house-vote/119/1/15?api_key=${apiKey}&format=json`;
      const membersUrl = `https://api.congress.gov/v3/house-vote/119/1/15/members?api_key=${apiKey}&format=json`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsResponse);
      fetchMock.get(titlesUrl, { titles: [] });
      fetchMock.get(voteDetailsUrl, mockHouseVoteResponse);
      fetchMock.get(membersUrl, mockCongressMembersResponse);

      const billWithActions = await congressApi.getBill("HR", "1", 'all', true);

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      assert.ok(billWithActions.actions.actions.length > 0);
      // Should have populated votes on recordedVotes since includeVotes=true
      // Find the action with recordedVotes (H37300)
      const action = billWithActions.actions.actions.find(a => a.recordedVotes && a.recordedVotes.length > 0);
      assert.ok(action, "Should have at least one action with recorded votes");
      assert.ok(action.recordedVotes);
      assert.ok(action.recordedVotes.length > 0);
      assert.ok(action.recordedVotes[0].votes);
      
      // Check vote data
      const votes = action.recordedVotes[0].votes;
      assert.ok(votes["A000001"]); // Should have vote for member A000001
      
      // Should have called both vote details and members endpoints
      assert.strictEqual(fetchMock.callHistory.calls().length, 5); // bill, actions, titles, voteDetails, and members
    });

    test("should fetch senate votes when includeVotes=true", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/s/1?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/s/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const senateVoteUrl = "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00372.xml";
      
      // Reset MockXmlUtils to clear any error state
      MockXmlUtils.reset();
      MockXmlUtils.setMockData(SENATE_MEMBERS_URL, mockSenateMembersData);
      
      // Ensure legislators are initialized
      await congressApi.initialize();
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsWithSenateVote);
      MockXmlUtils.setMockData(senateVoteUrl, mockSenateRollCallVoteXml);

      const billWithActions = await congressApi.getBill("S", "1", 'all', true);

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      assert.ok(billWithActions.actions.actions.length > 0);
      // Should have populated votes on recordedVotes since includeVotes=true
      const action = billWithActions.actions.actions[0];
      assert.ok(action.recordedVotes);
      assert.ok(action.recordedVotes.length > 0);
      assert.ok(action.recordedVotes[0].votes);
      
      // Check senate vote data
      const votes = action.recordedVotes[0].votes;
      assert.strictEqual(votes["B000002"], "Yea");
      
      // Check extended vote data
      const recordedVote = action.recordedVotes[0];
      assert.strictEqual(recordedVote.result, "passed");
      assert.strictEqual(recordedVote.question, "On Passage of the Bill");
      assert.ok(recordedVote.senateCount);
      assert.strictEqual(recordedVote.senateCount.yeas, "51");
      assert.strictEqual(recordedVote.senateCount.nays, "50");
    });

    test("should exclude Library of Congress actions when includeActions='all'", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/6?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/6/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsResponseWithLibraryOfCongress);

      const billWithActions = await congressApi.getBill("HR", "6", 'all', false);

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      assert.ok(Array.isArray(billWithActions.actions.actions));
      
      const keptCount = mockBillActionsResponseWithLibraryOfCongress.actions.filter(
        (a: { sourceSystem?: { name?: string }; type?: string }) => shouldKeepAction(a)
      ).length;
      assert.strictEqual(billWithActions.actions.actions.length, keptCount);
      const hasExcludedLoC = billWithActions.actions.actions.some(
        (a) => a.sourceSystem?.name === "Library of Congress" && a.type !== "President" && a.type !== "BecameLaw"
      );
      assert.strictEqual(hasExcludedLoC, false, "Should exclude LoC actions except President/BecameLaw");
      const hasHouseFloorAction = billWithActions.actions.actions.some(
        action => action.sourceSystem?.name === "House floor actions"
      );
      assert.strictEqual(hasHouseFloorAction, true, "Should include House floor actions");
    });

    test("should filter to only actions with recorded votes when includeActions='votes'", async () => {
      const apiKey = TEST_API_KEY;
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/7?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/7/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsResponse);

      const billWithActions = await congressApi.getBill("HR", "7", 'votes', false);

      assert.ok(billWithActions);
      assert.ok(billWithActions.actions);
      assert.ok(Array.isArray(billWithActions.actions.actions));
      
      // Should only include actions with recorded votes
      // mockBillActionsResponse has one action with recordedVotes (H37300)
      // Actions with recorded votes that we keep (LoC except President/BecameLaw excluded)
      const actionsWithRecordedVotes = mockBillActionsResponse.actions.filter(
        (action) => action.recordedVotes && action.recordedVotes.length > 0 && shouldKeepAction(action)
      );
      assert.strictEqual(billWithActions.actions.actions.length, actionsWithRecordedVotes.length);
      
      // Verify all returned actions have recorded votes
      billWithActions.actions.actions.forEach(action => {
        assert.ok(action.recordedVotes, "Action should have recordedVotes");
        assert.ok(action.recordedVotes.length > 0, "Action should have at least one recorded vote");
      });
    });
  });

  describe("getBills method", () => {
    test("should get all bills without filtering", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billsUrl, mockBillListResponse);

      const bills = await congressApi.getBills();

      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, mockBillListResponse.bills.length);
      assert.strictEqual((bills[0] as any).number, "1");
      assert.strictEqual((bills[0] as any).type, "HR");
    });

    test("should get bills by legislation type", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billsUrl, mockBillListResponse);

      const bills = await congressApi.getBills("HR");

      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, mockBillListResponse.bills.length);
      assert.ok(bills.every(bill => (bill as any).type === "HR"));
    });

    test("should respect manual pagination params", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=20&limit=10`;
      
      fetchMock.get(billsUrl, mockBillListResponse);

      const bills = await congressApi.getBills(undefined, 'none', false, { offset: 20, limit: 10 });

      assert.ok(Array.isArray(bills));
      // Should only make one request when offset/limit specified
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should fetch all pages by default", async () => {
      const apiKey = TEST_API_KEY;
      
      // Mock first page (full page indicates more pages exist)
      const firstPageUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const firstPageResponse = {
        ...mockBillListResponse,
        bills: Array(250).fill(null).map((_, i) => ({
          ...mockBillListResponse.bills[0],
          number: String(i + 1),
        })),
      };
      fetchMock.get(firstPageUrl, firstPageResponse);

      // Mock second page (partial page indicates end)
      const secondPageUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=250&limit=250`;
      const secondPageResponse = {
        ...mockBillListResponse,
        bills: mockBillListResponse.bills.slice(0, 2), // Only 2 bills, less than page limit
      };
      fetchMock.get(secondPageUrl, secondPageResponse);

      const bills = await congressApi.getBills();

      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, 252); // 250 + 2
    });

    test("should fetch full bill details when includeActions='all'", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Mock bill list with 3 bills
      fetchMock.get(billsUrl, mockBillListResponse);

      // Mock individual bill responses
      // Bill 1 has actions
      const bill1Url = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      const bill1ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      fetchMock.get(bill1Url, mockCongressBillResponse);
      fetchMock.get(bill1ActionsUrl, mockBillActionsResponse);

      // Bill 2 has actions
      const bill2Url = `https://api.congress.gov/v3/bill/119/hr/2?api_key=${apiKey}&format=json`;
      const bill2ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/2/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      fetchMock.get(bill2Url, mockCongressBillResponse);
      fetchMock.get(bill2ActionsUrl, mockBillActionsWithoutChamberVotes);

      // Bill 3 has actions
      const bill3Url = `https://api.congress.gov/v3/bill/119/hr/3?api_key=${apiKey}&format=json`;
      const bill3ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/3/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      fetchMock.get(bill3Url, mockCongressBillResponse);
      fetchMock.get(bill3ActionsUrl, mockBillActionsResponse);

      const bills = await congressApi.getBills(undefined, 'all');

      assert.ok(Array.isArray(bills));
      // Should return all 3 bills with actions
      assert.strictEqual(bills.length, 3);
      // When includeActions='all', returns BillWithActions directly (not wrapped in { bill })
      assert.ok('actions' in bills[0]);
      assert.ok('actions' in bills[1]);
      assert.ok('actions' in bills[2]);
    });

    test("should return BaseBillSummary when includeActions='none' (default)", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billsUrl, mockBillListResponse);

      const bills = await congressApi.getBills(undefined, 'none');

      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, 3);
      // When includeActions='none', should return BaseBillSummary (no actions property)
      assert.strictEqual((bills[0] as any).actions, undefined);
      assert.ok((bills[0] as any).number);
      assert.ok((bills[0] as any).type);
    });

    test("should combine includeActions and includeVotes parameters", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billsUrl, mockBillListResponse);

      // Mock individual bill responses
      // Bill 1 has actions
      const bill1Url = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      const bill1ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      fetchMock.get(bill1Url, mockCongressBillResponse);
      fetchMock.get(bill1ActionsUrl, mockBillActionsResponse);

      // Bill 2 has actions
      const bill2Url = `https://api.congress.gov/v3/bill/119/hr/2?api_key=${apiKey}&format=json`;
      const bill2ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/2/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      fetchMock.get(bill2Url, mockCongressBillResponse);
      fetchMock.get(bill2ActionsUrl, mockBillActionsWithoutChamberVotes);

      // Bill 3 has actions
      const bill3Url = `https://api.congress.gov/v3/bill/119/hr/3?api_key=${apiKey}&format=json`;
      const bill3ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/3/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      fetchMock.get(bill3Url, mockCongressBillResponse);
      fetchMock.get(bill3ActionsUrl, mockBillActionsResponse);

      // Mock members endpoint for votes when includeVotes=true
      const voteDetailsUrl = `https://api.congress.gov/v3/house-vote/119/1/15?api_key=${apiKey}&format=json`;
      const membersUrl = `https://api.congress.gov/v3/house-vote/119/1/15/members?api_key=${apiKey}&format=json`;
      fetchMock.get(voteDetailsUrl, mockHouseVoteResponse);
      fetchMock.get(membersUrl, mockCongressMembersResponse);

      const bills = await congressApi.getBills(undefined, 'all', true);

      assert.ok(Array.isArray(bills));
      // Should return all bills with actions
      assert.strictEqual(bills.length, 3);
      // Should have full details with actions property (BillWithActions structure)
      assert.ok('actions' in bills[0]);
      assert.ok('actions' in (bills[0] as any).actions);
      assert.ok(Array.isArray((bills[0] as any).actions.actions));
      // When includeVotes=true, should have vote data on recordedVotes
      // Find action with recordedVotes
      const actionWithVotes = (bills[0] as any).actions.actions.find((a: any) => a.recordedVotes && a.recordedVotes.length > 0);
      if (actionWithVotes) {
        assert.ok(actionWithVotes.recordedVotes[0].votes);
      }
    });

    test("should handle empty results", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billsUrl, {
        ...mockBillListResponse,
        bills: [],
      });

      const bills = await congressApi.getBills();

      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, 0);
    });

    test("should handle errors gracefully", async () => {
      fetchMock.catch({ throws: new Error("API Error") });

      const bills = await congressApi.getBills();

      // Should return empty array on error
      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, 0);
    });

    test("should pass datetime filters to API", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250&fromDateTime=2025-01-01T00%3A00%3A00Z&toDateTime=2025-12-31T23%3A59%3A59Z`;
      
      fetchMock.get(billsUrl, mockBillListResponse);

      const bills = await congressApi.getBills(undefined, 'none', false, {
        fromDateTime: "2025-01-01T00:00:00Z",
        toDateTime: "2025-12-31T23:59:59Z",
      });

      assert.ok(Array.isArray(bills));
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should return full BillWithActions when includeActions='all'", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billsUrl, mockBillListResponse);

      // Mock individual bill responses
      for (let i = 1; i <= 3; i++) {
        const billUrl = `https://api.congress.gov/v3/bill/119/hr/${i}?api_key=${apiKey}&format=json`;
        const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/${i}/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
        fetchMock.get(billUrl, mockCongressBillResponse);
        fetchMock.get(actionsUrl, mockBillActionsResponse);
      }

      const bills = await congressApi.getBills(undefined, 'all');

      assert.ok(Array.isArray(bills));
      // Should return BillWithActions structure (directly, not wrapped in { bill })
      if (bills.length > 0) {
        assert.ok('actions' in bills[0]);
        assert.ok('actions' in (bills[0] as any).actions);
      }
    });

    test("should pass includeVotes parameter to getBill when includeActions='all'", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      fetchMock.get(billsUrl, mockBillListResponse);

      // Mock individual bill responses
      const billUrl = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const voteDetailsUrl = `https://api.congress.gov/v3/house-vote/119/1/15?api_key=${apiKey}&format=json`;
      const membersUrl = `https://api.congress.gov/v3/house-vote/119/1/15/members?api_key=${apiKey}&format=json`;
      
      fetchMock.get(billUrl, mockCongressBillResponse);
      fetchMock.get(actionsUrl, mockBillActionsResponse);
      fetchMock.get(voteDetailsUrl, mockHouseVoteResponse);
      fetchMock.get(membersUrl, mockCongressMembersResponse);

      const bills = await congressApi.getBills(undefined, 'all', true);

      assert.ok(Array.isArray(bills));
      // Should have fetched votes (members endpoint should be called)
      if (bills.length > 0) {
        assert.ok('actions' in bills[0]);
        const bill = bills[0] as any;
        assert.ok(bill.actions);
        // When includeVotes=true, should have vote data on recordedVotes
        // Find action with recordedVotes
        const actionWithVotes = bill.actions.actions.find((a: any) => a.recordedVotes && a.recordedVotes.length > 0);
        if (actionWithVotes) {
          assert.ok(actionWithVotes.recordedVotes[0].votes);
        }
      }
    });
  });

  describe("legislators integration", () => {
    test("should access legislators methods through the legislators property", async () => {
      // The CongressApi extends Legislators, so it has legislators methods directly
      await congressApi.initialize();
      
      // Access legislators methods directly (CongressApi extends Legislators)
      const allLegislators = await congressApi.getAllLegislators();
      assert.ok(Array.isArray(allLegislators));
      assert.ok(allLegislators.length > 0);
      
      const legislatorsByState = await congressApi.getLegislatorsByState("CA");
      assert.ok(Array.isArray(legislatorsByState));
      assert.ok(legislatorsByState.every(l => l.latest_term?.state === "CA"));
    });
  });


  describe("error handling", () => {
    test("should handle YAML download errors during initialization", async () => {
      MockYamlUtils.setShouldThrowError(true, "Failed to download YAML");

      await assert.rejects(
        () => congressApi.initialize(),
        /Failed to download YAML/
      );
    });

    test("should handle API errors gracefully", async () => {
      fetchMock.catch({ throws: new Error("API Error") });

      // Test that API errors are handled through the inherited AbstractCongressApi methods
      await assert.rejects(
        () => congressApi['fetchHouseVotes'](119, 1),
        /API Error/
      );
    });

    test("should handle getLegislator with initialization error", async () => {
      MockYamlUtils.setShouldThrowError(true, "Initialization failed");

      await assert.rejects(
        () => congressApi.getLegislator("A000001"),
        /Initialization failed/
      );
    });
  });

  describe("integration scenarios", () => {
    test("should combine legislator data with Congress API data", async () => {
      // Get a member using legislator data
      const member = await congressApi.getLegislator("A000001");
      assert.ok(member);
      assert.strictEqual(member.id?.bioguide, "A000001");
      
      // CongressApi extends AbstractCongressApi, so Congress API methods are available through inheritance
      // This demonstrates that both legislator data and Congress API functionality are accessible
      assert.strictEqual(member.name?.first, "Alex");
      assert.strictEqual(member.name?.last, "Anderson");
    });

    test("should handle mixed data sources for member lookup", async () => {
      // Get all legislators and find by name
      const allLegislators = await congressApi.getAllLegislators();
      const legislator = allLegislators.find(l => 
        l.name?.last === "Brown" || l.lastName === "Brown"
      );
      assert.ok(legislator, "Should find legislator named Brown");
      
      // Then get the same member by bioguide ID using getLegislator
      const bioguideId = legislator.id?.bioguide || legislator.bioguideId;
      const sameMember = await congressApi.getLegislator(bioguideId);
      assert.ok(sameMember);
      assert.strictEqual(sameMember.bioguideId, bioguideId);
    });

    test("should work with different congressional terms", async () => {
      const tempDir = `/tmp/congress-api-test-118-${Date.now()}`;
      const api118 = new CongressApi(
        118,
        fetchMock.fetchHandler as typeof fetch,
        tempDir,
        MockYamlUtils as any,
        fs,
        MockXmlUtils as any,
      );
      
      assert.strictEqual(api118.getCongressionalTerm(), 118);
      
      // Should still be able to get legislator data (which is current)
      const member = await api118.getLegislator("A000001");
      assert.ok(member);
      assert.strictEqual(member.id?.bioguide, "A000001");
    });
  });

  describe("caching behavior", () => {
    test("should cache legislator data between calls", async () => {
      // First call should initialize
      const member1 = await congressApi.getLegislator("A000001");
      assert.ok(member1);
      
      // Second call should use cached data (no additional YAML downloads)
      const member2 = await congressApi.getLegislator("B000002");
      assert.ok(member2);
      
      // Both should be available
      assert.strictEqual(member1.id?.bioguide, "A000001");
      assert.strictEqual(member2.id?.bioguide, "B000002");
    });

    test("should cache Congress API calls through inheritance", async () => {
      // CongressApi inherits from AbstractCongressApi, so caching works through inheritance
      // This test verifies that the inheritance chain is working properly
      await congressApi.initialize();
      
      // Verify that CongressApi has access to AbstractCongressApi methods through inheritance
      assert.ok(typeof congressApi['fetchBillInfo'] === 'function');
      assert.ok(typeof congressApi['makeCongressApiCall'] === 'function');
    });
  });

  describe("getBillsWithVotes method", () => {
    test("should get bills with recorded votes", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Mock bill list with 2 bills
      const mockBillListWithVotes = {
        bills: [
          {
            congress: 119,
            number: "1",
            type: "HR",
            title: "Bill with votes",
            latestAction: { text: "Passed House", actionDate: "2025-01-15" },
          },
          {
            congress: 119,
            number: "2",
            type: "HR",
            title: "Bill referred to committee",
            latestAction: { text: "Referred to the Committee on Ways and Means", actionDate: "2025-01-10" },
          },
        ],
      };
      
      fetchMock.get(billsUrl, mockBillListWithVotes);
      
      // Bill 1 has recorded votes - mock full bill data
      const bill1ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const bill1Url = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      const bill1TitlesUrl = `https://api.congress.gov/v3/bill/119/hr/1/titles?api_key=${apiKey}&format=json`;
      const voteDetailsUrl = `https://api.congress.gov/v3/house-vote/119/1/15?api_key=${apiKey}&format=json`;
      const membersUrl = `https://api.congress.gov/v3/house-vote/119/1/15/members?api_key=${apiKey}&format=json`;
      
      fetchMock.get(bill1ActionsUrl, mockBillActionsResponse);
      fetchMock.get(bill1Url, mockCongressBillResponse);
      fetchMock.get(bill1TitlesUrl, { titles: [] });
      fetchMock.get(voteDetailsUrl, mockHouseVoteResponse);
      fetchMock.get(membersUrl, mockCongressMembersResponse);
      
      const bills = await congressApi.getBillsWithVotes("HR");
      
      assert.ok(Array.isArray(bills));
      // Should only return bill 1 (bill 2 is filtered by pre-filter)
      assert.strictEqual(bills.length, 1);
      assert.strictEqual(bills[0].number, "1");
      // Should have all kept actions (LoC except President/BecameLaw excluded)
      assert.ok(bills[0].actions);
      const keptCount = mockBillActionsResponse.actions.filter(
        (a: { sourceSystem?: { name?: string }; type?: string }) => shouldKeepAction(a)
      ).length;
      assert.strictEqual(bills[0].actions.actions.length, keptCount);
      // Verify the action with votes has vote details populated
      const actionWithVotes = bills[0].actions.actions.find(a => a.recordedVotes && a.recordedVotes.length > 0);
      assert.ok(actionWithVotes, "Should have an action with recordedVotes");
      assert.ok(actionWithVotes.recordedVotes![0].votes, "Should have vote details populated");
    });

    test("should pre-filter bills with committee referral actions", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // All bills have committee referral actions - should all be filtered
      const mockBillListWithReferrals = {
        bills: [
          {
            congress: 119,
            number: "1",
            type: "HR",
            latestAction: { text: "Referred to the Committee on Ways and Means", actionDate: "2025-01-10" },
          },
          {
            congress: 119,
            number: "2",
            type: "HR",
            latestAction: { text: "Referred to the House Committee on the Judiciary", actionDate: "2025-01-10" },
          },
          {
            congress: 119,
            number: "3",
            type: "HR",
            latestAction: { text: "Referred to the Subcommittee on Crime and Government Surveillance", actionDate: "2025-01-10" },
          },
          {
            congress: 119,
            number: "4",
            type: "HR",
            latestAction: { text: "Received in the Senate and Read twice and referred to the Committee on Finance", actionDate: "2025-01-10" },
          },
        ],
      };
      
      fetchMock.get(billsUrl, mockBillListWithReferrals);
      
      const bills = await congressApi.getBillsWithVotes("HR");
      
      assert.ok(Array.isArray(bills));
      // All bills should be filtered out - no actions endpoint should be called
      assert.strictEqual(bills.length, 0);
      // Should only call the bills list endpoint
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should skip bills without recorded votes after fetching actions", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Bill with non-referral action but no recorded votes
      const mockBillList = {
        bills: [
          {
            congress: 119,
            number: "1",
            type: "HR",
            latestAction: { text: "Introduced in House", actionDate: "2025-01-10" },
          },
        ],
      };
      
      fetchMock.get(billsUrl, mockBillList);
      
      // Actions without recorded votes
      const actionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      fetchMock.get(actionsUrl, mockBillActionsWithoutChamberVotes);
      
      const bills = await congressApi.getBillsWithVotes("HR");
      
      assert.ok(Array.isArray(bills));
      // Should return empty - bill has no recorded votes
      assert.strictEqual(bills.length, 0);
      // Should call bills list and actions (but not bill info or titles)
      assert.strictEqual(fetchMock.callHistory.calls().length, 2);
    });

    test("should handle errors gracefully", async () => {
      fetchMock.catch({ throws: new Error("API Error") });
      
      const bills = await congressApi.getBillsWithVotes("HR");
      
      assert.ok(Array.isArray(bills));
      assert.strictEqual(bills.length, 0);
    });

    test("should pass pagination parameters", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${apiKey}&format=json&offset=10&limit=5`;
      
      fetchMock.get(billsUrl, { bills: [] });
      
      const bills = await congressApi.getBillsWithVotes("HR", { offset: 10, limit: 5 });
      
      assert.ok(Array.isArray(bills));
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should process only updated bills when cache exists (incremental update)", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Mock bill list response - 2 bills, one unchanged and one updated
      const mockBillListResponse = {
        bills: [
          {
            congress: 119,
            number: "1",
            type: "HR",
            title: "Unchanged bill",
            updateDate: "2025-01-15", // Same as cache
            latestAction: { text: "Passed House", actionDate: "2025-01-15" },
          },
          {
            congress: 119,
            number: "2",
            type: "HR",
            title: "Updated bill",
            updateDate: "2025-01-20", // Different from cache (was 2025-01-10)
            latestAction: { text: "Passed House", actionDate: "2025-01-20" },
          },
        ],
      };
      
      // Set up cache with old updateDate for bill 2
      const billListParams = { fromDateTime: undefined, toDateTime: undefined, limit: 250, offset: 0 };
      const cacheFilePath = getCacheFilePath(tempDir, "/bill/119/hr", billListParams);
      fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
      fs.writeFileSync(cacheFilePath, JSON.stringify({
        bills: [
          { number: "1", updateDate: "2025-01-15" },
          { number: "2", updateDate: "2025-01-10" }, // Old date - should be processed
        ],
      }));
      
      fetchMock.get(billsUrl, mockBillListResponse);
      
      // Only bill 2 should have actions fetched (it was updated)
      const bill2ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/2/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const bill2Url = `https://api.congress.gov/v3/bill/119/hr/2?api_key=${apiKey}&format=json`;
      const bill2TitlesUrl = `https://api.congress.gov/v3/bill/119/hr/2/titles?api_key=${apiKey}&format=json`;
      const voteDetailsUrl = `https://api.congress.gov/v3/house-vote/119/1/123?api_key=${apiKey}&format=json`;
      const membersUrl = `https://api.congress.gov/v3/house-vote/119/1/123/members?api_key=${apiKey}&format=json`;
      
      fetchMock.get(bill2ActionsUrl, mockBillActionsResponse);
      fetchMock.get(bill2Url, mockCongressBillResponse);
      fetchMock.get(bill2TitlesUrl, { titles: [] });
      fetchMock.get(voteDetailsUrl, mockHouseVoteResponse);
      fetchMock.get(membersUrl, mockCongressMembersResponse);
      
      const bills = await congressApi.getBillsWithVotes("HR");
      
      assert.ok(Array.isArray(bills));
      // Only bill 2 should be returned (bill 1 was unchanged)
      assert.strictEqual(bills.length, 1);
      // Bill 2 has recorded votes in mockBillActionsResponse
      assert.strictEqual(bills[0].number, "1"); // mockCongressBillResponse.bill.number
    });

    test("should process all bills when no cache exists", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Single bill with votes
      const mockBillListResponse = {
        bills: [
          {
            congress: 119,
            number: "1",
            type: "HR",
            title: "New bill",
            updateDate: "2025-01-15",
            latestAction: { text: "Passed House", actionDate: "2025-01-15" },
          },
        ],
      };
      
      fetchMock.get(billsUrl, mockBillListResponse);
      
      const bill1ActionsUrl = `https://api.congress.gov/v3/bill/119/hr/1/actions?api_key=${apiKey}&format=json&offset=0&limit=250`;
      const bill1Url = `https://api.congress.gov/v3/bill/119/hr/1?api_key=${apiKey}&format=json`;
      const bill1TitlesUrl = `https://api.congress.gov/v3/bill/119/hr/1/titles?api_key=${apiKey}&format=json`;
      const voteDetailsUrl = `https://api.congress.gov/v3/house-vote/119/1/123?api_key=${apiKey}&format=json`;
      const membersUrl = `https://api.congress.gov/v3/house-vote/119/1/123/members?api_key=${apiKey}&format=json`;
      
      fetchMock.get(bill1ActionsUrl, mockBillActionsResponse);
      fetchMock.get(bill1Url, mockCongressBillResponse);
      fetchMock.get(bill1TitlesUrl, { titles: [] });
      fetchMock.get(voteDetailsUrl, mockHouseVoteResponse);
      fetchMock.get(membersUrl, mockCongressMembersResponse);
      
      const bills = await congressApi.getBillsWithVotes("HR");
      
      assert.ok(Array.isArray(bills));
      // Should process the bill since there's no cache
      assert.strictEqual(bills.length, 1);
    });

    test("should return empty array when all bills are unchanged", async () => {
      const apiKey = TEST_API_KEY;
      const billsUrl = `https://api.congress.gov/v3/bill/119/hr?api_key=${apiKey}&format=json&offset=0&limit=250`;
      
      // Bill with same updateDate as cache
      const mockBillListResponse = {
        bills: [
          {
            congress: 119,
            number: "1",
            type: "HR",
            title: "Unchanged bill",
            updateDate: "2025-01-15",
            latestAction: { text: "Passed House", actionDate: "2025-01-15" },
          },
        ],
      };
      
      // Set up cache with same updateDate
      const billListParams = { fromDateTime: undefined, toDateTime: undefined, limit: 250, offset: 0 };
      const cacheFilePath = getCacheFilePath(tempDir, "/bill/119/hr", billListParams);
      fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
      fs.writeFileSync(cacheFilePath, JSON.stringify({
        bills: [
          { number: "1", updateDate: "2025-01-15" }, // Same date - should be skipped
        ],
      }));
      
      fetchMock.get(billsUrl, mockBillListResponse);
      
      const bills = await congressApi.getBillsWithVotes("HR");
      
      assert.ok(Array.isArray(bills));
      // Should return empty since bill is unchanged
      assert.strictEqual(bills.length, 0);
      // Verify incremental update logic: no actions/info/titles calls should be made
      // since all bills are unchanged (main behavior verified above)
    });
  });

  describe("getBillUpdateDates helper", () => {
    test("should create map of bill numbers to updateDates", () => {
      const bills = [
        { number: "1", updateDate: "2025-01-15" },
        { number: "2", updateDate: "2025-01-20" },
        { number: "3", updateDate: undefined },
      ];
      
      const result = (congressApi as any).getBillUpdateDates(bills);
      
      assert.ok(result instanceof Map);
      assert.strictEqual(result.size, 3);
      assert.strictEqual(result.get("1"), "2025-01-15");
      assert.strictEqual(result.get("2"), "2025-01-20");
      assert.strictEqual(result.get("3"), undefined);
    });
  });

  describe("helper methods", () => {
    test("normalizeVoteResult returns 'passed' for pass/agreed/confirmed, 'rejected' otherwise", async () => {
      await (congressApi as any).ensureInitialized();
      assert.strictEqual(congressApi.normalizeVoteResult("Passed"), "passed");
      assert.strictEqual(congressApi.normalizeVoteResult("Passed by Unanimous Consent"), "passed");
      assert.strictEqual(congressApi.normalizeVoteResult("Agreed to"), "passed");
      assert.strictEqual(congressApi.normalizeVoteResult("Confirmed"), "passed");
      assert.strictEqual(congressApi.normalizeVoteResult("Failed"), "rejected");
      assert.strictEqual(congressApi.normalizeVoteResult("Rejected"), "rejected");
      assert.strictEqual(congressApi.normalizeVoteResult(""), "rejected");
      assert.strictEqual(congressApi.normalizeVoteResult("Unknown"), "rejected");
    });

    test("hasRecordedVotes should return true for actions with recorded votes", async () => {
      const actionWithVotes = {
        actionDate: "2025-01-15",
        text: "Test action",
        recordedVotes: [{ chamber: "House", rollNumber: 1 }],
        sourceSystem: { name: "House floor actions" },
      };
      
      // Access private method via bracket notation
      const result = (congressApi as any).hasRecordedVotes(actionWithVotes);
      assert.strictEqual(result, true);
    });

    test("hasRecordedVotes should return false for Library of Congress actions", async () => {
      const actionFromLOC = {
        actionDate: "2025-01-15",
        text: "Test action",
        recordedVotes: [{ chamber: "House", rollNumber: 1 }],
        sourceSystem: { name: "Library of Congress" },
      };
      
      const result = (congressApi as any).hasRecordedVotes(actionFromLOC);
      assert.strictEqual(result, false);
    });

    test("hasRecordedVotes should return false for actions without recorded votes", async () => {
      const actionWithoutVotes = {
        actionDate: "2025-01-15",
        text: "Test action",
        recordedVotes: [],
      };
      
      const result = (congressApi as any).hasRecordedVotes(actionWithoutVotes);
      assert.strictEqual(result, false);
    });

    test("hasRecordedVotes should return true for Senate unanimous consent pass", async () => {
      const ucAction = {
        actionDate: "2025-06-01",
        text: "Received in the Senate, read twice, and passed without amendment by Unanimous Consent.",
        sourceSystem: { name: "Senate" },
        type: "Floor",
      };
      const result = (congressApi as any).hasRecordedVotes(ucAction);
      assert.strictEqual(result, true);
    });

    test("hasRecordedVotes should return true for Senate voice vote (floor, agreed to)", async () => {
      const action = {
        actionDate: "2025-12-08",
        text: "Motion to proceed to consideration of measure agreed to in Senate by Voice Vote.",
        sourceSystem: { name: "Senate" },
        type: "Floor",
      };
      const result = (congressApi as any).hasRecordedVotes(action);
      assert.strictEqual(result, true);
    });

    test("hasRecordedVotes should return true for House voice vote (floor, passed)", async () => {
      const action = {
        actionDate: "2025-06-01",
        text: "On motion to suspend the rules and pass the bill Agreed to by voice vote.",
        sourceSystem: { name: "House" },
        type: "Floor",
      };
      const result = (congressApi as any).hasRecordedVotes(action);
      assert.strictEqual(result, true);
    });

    test("hasRecordedVotes should return false for voice vote when demanded the yeas and nays", async () => {
      const action = {
        actionDate: "2025-06-01",
        text: "By voice vote, announced the ayes had prevailed. Mr. McGovern demanded the yeas and nays and the Chair postponed further proceedings.",
        sourceSystem: { name: "House" },
        type: "Floor",
      };
      const result = (congressApi as any).hasRecordedVotes(action);
      assert.strictEqual(result, false);
    });

    test("hasRecordedVotes should return false for voice vote when demanded a recorded vote", async () => {
      const action = {
        actionDate: "2025-06-01",
        text: "By voice vote, announced that the ayes prevailed. Mr. McGovern demanded a recorded vote and the Chair postponed further proceedings.",
        sourceSystem: { name: "House" },
        type: "Floor",
      };
      const result = (congressApi as any).hasRecordedVotes(action);
      assert.strictEqual(result, false);
    });

    test("hasRecordedVotes should return true for House passage by unanimous consent / without objection", async () => {
      const action = {
        actionCode: "H37100",
        actionDate: "2026-04-17",
        text: "On passage Passed without objection. (text: CR H2955)",
        sourceSystem: { code: 2, name: "House floor actions" },
        type: "Floor",
      };
      const result = (congressApi as any).hasRecordedVotes(action);
      assert.strictEqual(result, true);
    });

    test("hasRecordedVotes should return false for non-passage House 'without objection' floor actions", async () => {
      const action = {
        actionDate: "2026-04-17",
        text: "Motion to reconsider laid on the table Agreed to without objection.",
        sourceSystem: { code: 2, name: "House floor actions" },
        type: "Floor",
      };
      const result = (congressApi as any).hasRecordedVotes(action);
      assert.strictEqual(result, false);
    });

    test("hasRecordedVotes should return false for Senate 'without objection' (must be House)", async () => {
      const action = {
        actionDate: "2026-04-17",
        text: "On passage Passed without objection.",
        sourceSystem: { name: "Senate" },
        type: "Floor",
      };
      const result = (congressApi as any).hasRecordedVotes(action);
      assert.strictEqual(result, false);
    });

    test("preFilterBillsByLatestAction should filter committee referral bills", async () => {
      const bills = [
        { number: "1", latestAction: { text: "Passed House" } },
        { number: "2", latestAction: { text: "Referred to the Committee on Finance" } },
        { number: "3", latestAction: { text: "Referred to the House Committee on Ways" } },
        { number: "4", latestAction: { text: "Referred to the Subcommittee on Health" } },
        { number: "5", latestAction: { text: "Received in the Senate and Read twice and referred to the Committee" } },
        { number: "6", latestAction: { text: "Signed by President" } },
      ];
      
      const result = (congressApi as any).preFilterBillsByLatestAction(bills);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].number, "1");
      assert.strictEqual(result[1].number, "6");
    });

    test("findLatestChamberVoteAction should return latest action with recorded votes", async () => {
      const actions = [
        {
          actionDate: "2025-01-10",
          text: "Early action",
          recordedVotes: [{ chamber: "House", rollNumber: 1 }],
        },
        {
          actionDate: "2025-01-15",
          text: "Later action",
          recordedVotes: [{ chamber: "House", rollNumber: 2 }],
        },
        {
          actionDate: "2025-01-12",
          text: "Middle action without votes",
          recordedVotes: [],
        },
      ];
      
      const result = (congressApi as any).findLatestChamberVoteAction(actions);
      
      assert.ok(result);
      assert.strictEqual(result.actionDate, "2025-01-15");
    });

    test("findLatestChamberVoteAction should return undefined when no chamber votes", async () => {
      const actions = [
        { actionDate: "2025-01-10", text: "Action 1", recordedVotes: [] },
        { actionDate: "2025-01-15", text: "Action 2" },
      ];
      
      const result = (congressApi as any).findLatestChamberVoteAction(actions);
      
      assert.strictEqual(result, undefined);
    });

    test("buildBillWithActions should combine bill response, actions, and titles", async () => {
      const billResponse = {
        bill: {
          congress: 119,
          number: "1",
          type: "HR",
          title: "Test Bill",
          actions: { count: 2 },
        },
      };
      const actions = [{ actionDate: "2025-01-15", text: "Action 1" }];
      const titlesResponse = { titles: [{ title: "Short Title", titleType: "Short" }] };
      
      const result = (congressApi as any).buildBillWithActions(billResponse, actions, titlesResponse);
      
      assert.strictEqual(result.number, "1");
      assert.strictEqual(result.type, "HR");
      assert.ok(result.actions);
      assert.ok(Array.isArray(result.actions.actions));
      assert.strictEqual(result.actions.actions.length, 1);
      assert.ok(result.titles);
      assert.ok(Array.isArray(result.titles.titles));
    });

    test("buildBillWithActions should handle missing titles", async () => {
      const billResponse = {
        bill: {
          congress: 119,
          number: "1",
          type: "HR",
          title: "Test Bill",
          actions: { count: 1 },
        },
      };
      const actions = [{ actionDate: "2025-01-15", text: "Action 1" }];
      
      const result = (congressApi as any).buildBillWithActions(billResponse, actions, undefined);
      
      assert.strictEqual(result.number, "1");
      assert.strictEqual(result.titles, undefined);
    });
  });

  describe("populateRecordedVotes ID assignment", () => {
    test("should assign IDs to recorded votes in reverse array order", async () => {
      // Simulating API response order: newest action first (House), then older (Senate)
      const actions = [
        {
          actionDate: "2025-07-03",
          text: "Passed House (newer, first in array)",
          recordedVotes: [
            {
              chamber: "House",
              congress: 119,
              date: "2025-07-03T18:31:38Z",
              rollNumber: 190,
              sessionNumber: 1,
              url: "https://clerk.house.gov/evs/2025/roll190.xml",
            },
          ],
        },
        {
          actionDate: "2025-07-01",
          text: "Passed Senate (older, second in array)",
          recordedVotes: [
            {
              chamber: "Senate",
              congress: 119,
              date: "2025-07-01T16:03:40Z",
              rollNumber: 372,
              sessionNumber: 1,
              url: "https://senate.gov/vote.xml",
            },
          ],
        },
      ];

      // Use congressApi.populateRecordedVotes directly
      // Note: This will try to fetch vote data, but we're testing ID assignment
      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "HR",
        billNumber: "1",
      });

      // IDs assigned in reverse array order, 1-based (last in array = suffix 1)
      // Senate is last in array, so it gets suffix 1
      // House is first in array, so it gets suffix 2
      assert.strictEqual(result[1].recordedVotes![0].id, "119-HR-1-1"); // Senate (last in array)
      assert.strictEqual(result[0].recordedVotes![0].id, "119-HR-1-2"); // House (first in array)
    });

    test("should not assign IDs when params not provided", async () => {
      const actions = [
        {
          actionDate: "2025-07-03",
          text: "Passed House",
          recordedVotes: [
            {
              chamber: "House",
              congress: 119,
              date: "2025-07-03T18:31:38Z",
              rollNumber: 190,
              sessionNumber: 1,
              url: "https://clerk.house.gov/evs/2025/roll190.xml",
            },
          ],
        },
      ];

      const result = await congressApi.populateRecordedVotes(actions as any);

      // ID should not be set
      assert.strictEqual(result[0].recordedVotes![0].id, undefined);
    });

    test("should exclude Library of Congress actions from result", async () => {
      const actions = [
        {
          actionDate: "2025-04-29",
          text: "Passed House",
          sourceSystem: { code: 2, name: "House floor actions" },
          recordedVotes: [
            {
              chamber: "House",
              congress: 119,
              date: "2025-04-29T21:29:01Z",
              rollNumber: 108,
              sessionNumber: 1,
              url: "https://clerk.house.gov/evs/2025/roll108.xml",
            },
          ],
        },
        {
          actionDate: "2025-04-29",
          text: "Passed House (LoC duplicate)",
          sourceSystem: { code: 9, name: "Library of Congress" },
          recordedVotes: [
            {
              chamber: "House",
              congress: 119,
              date: "2025-04-29T21:29:01Z",
              rollNumber: 108,
              sessionNumber: 1,
              url: "https://clerk.house.gov/evs/2025/roll108.xml",
            },
          ],
        },
      ];

      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "HR",
        billNumber: "1442",
      });

      assert.strictEqual(result.length, 1, "LoC action should be filtered out");
      assert.strictEqual(result[0].recordedVotes!.length, 1, "House floor action should keep its vote");
    });

    test("should handle multiple recorded votes in same action", async () => {
      const actions = [
        {
          actionDate: "2025-07-03",
          text: "Multiple votes",
          recordedVotes: [
            {
              chamber: "House",
              congress: 119,
              date: "2025-07-03T10:00:00Z",
              rollNumber: 100,
              sessionNumber: 1,
              url: "https://clerk.house.gov/evs/2025/roll100.xml",
            },
            {
              chamber: "House",
              congress: 119,
              date: "2025-07-03T14:00:00Z",
              rollNumber: 101,
              sessionNumber: 1,
              url: "https://clerk.house.gov/evs/2025/roll101.xml",
            },
          ],
        },
      ];

      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "S",
        billNumber: "42",
      });

      // Both votes in same action, IDs assigned in reverse array order (1-based)
      // roll101 (last in array) gets suffix 1, roll100 (first in array) gets suffix 2
      assert.strictEqual(result[0].recordedVotes![0].id, "119-S-42-2"); // roll100 (first in array)
      assert.strictEqual(result[0].recordedVotes![1].id, "119-S-42-1"); // roll101 (last in array)
    });

    test("should uppercase bill type in ID", async () => {
      const actions = [
        {
          actionDate: "2025-07-03",
          text: "Vote",
          recordedVotes: [
            {
              chamber: "House",
              congress: 119,
              date: "2025-07-03T18:31:38Z",
              rollNumber: 190,
              sessionNumber: 1,
              url: "https://clerk.house.gov/evs/2025/roll190.xml",
            },
          ],
        },
      ];

      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "hjres", // lowercase
        billNumber: "5",
      });

      assert.strictEqual(result[0].recordedVotes![0].id, "119-HJRES-5-1");
    });

    test("should handle actions without recorded votes", async () => {
      const actions = [
        {
          actionDate: "2025-07-01",
          text: "No votes here",
        },
        {
          actionDate: "2025-07-02",
          text: "Has a vote",
          recordedVotes: [
            {
              chamber: "House",
              congress: 119,
              date: "2025-07-02T12:00:00Z",
              rollNumber: 50,
              sessionNumber: 1,
              url: "https://clerk.house.gov/evs/2025/roll50.xml",
            },
          ],
        },
      ];

      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "HR",
        billNumber: "100",
      });

      // First action has no recordedVotes
      assert.strictEqual(result[0].recordedVotes, undefined);
      // Second action should have ID assigned (1-based)
      assert.strictEqual(result[1].recordedVotes![0].id, "119-HR-100-1");
    });

    test("should populate Senate unanimous consent with Passed by Unanimous Consent and canonical votePartyTotal", async () => {
      const ucAction = {
        actionDate: "2024-06-15",
        text: "Received in the Senate, read twice, and passed without amendment by Unanimous Consent.",
        sourceSystem: { name: "Senate" },
        type: "Floor",
      };
      const actions = [ucAction];
      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "HR",
        billNumber: "1",
      });
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].recordedVotes);
      assert.strictEqual(result[0].recordedVotes!.length, 1);
      const rv = result[0].recordedVotes![0];
      assert.strictEqual(rv.result, "passed");
      assert.ok(rv.votePartyTotal);
      const parties = new Set(rv.votePartyTotal!.map((p) => p.voteParty));
      for (const p of parties) {
        assert.ok(
          p === "Republican" || p === "Democrat" || p === "Independent",
          `voteParty should be Republican, Democrat, or Independent, got ${p}`
        );
      }
      assert.ok(typeof (rv as any).senateCount?.yeas === "number");
    });

    test("should populate Senate voice vote with vv for each senator and result from text", async () => {
      const voiceVoteAction = {
        actionDate: "2024-06-15",
        text: "Motion to proceed to consideration of measure agreed to in Senate by Voice Vote.",
        sourceSystem: { name: "Senate" },
        type: "Floor",
      };
      const actions = [voiceVoteAction];
      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "SRES",
        billNumber: "532",
      });
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].recordedVotes);
      assert.strictEqual(result[0].recordedVotes!.length, 1);
      const rv = result[0].recordedVotes![0];
      assert.strictEqual(rv.chamber, "Senate");
      assert.strictEqual(rv.result, "passed");
      assert.strictEqual(rv.question, "Voice Vote");
      assert.ok(rv.votes);
      const voteValues = Object.values(rv.votes!);
      assert.ok(voteValues.length > 0);
      assert.ok(voteValues.every((v) => v === "vv"));
    });

    test("should populate House voice vote with vv for each representative", async () => {
      const voiceVoteAction = {
        actionDate: "2024-06-15",
        text: "On motion to suspend the rules and pass the bill Agreed to by voice vote.",
        sourceSystem: { name: "House" },
        type: "Floor",
      };
      const actions = [voiceVoteAction];
      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "HR",
        billNumber: "1",
      });
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].recordedVotes);
      assert.strictEqual(result[0].recordedVotes!.length, 1);
      const rv = result[0].recordedVotes![0];
      assert.strictEqual(rv.chamber, "House");
      assert.strictEqual(rv.result, "passed");
      assert.strictEqual(rv.question, "Voice Vote");
      assert.ok(rv.votes);
      const voteValues = Object.values(rv.votes!);
      assert.ok(voteValues.length > 0);
      assert.ok(voteValues.every((v) => v === "vv"));
    });

    test("should set chamber House for voice vote when sourceSystem is House floor actions", async () => {
      const voiceVoteAction = {
        actionDate: "2025-12-15",
        text: "On motion to suspend the rules and pass the bill, as amended Agreed to by voice vote.",
        sourceSystem: { code: 2, name: "House floor actions" },
        type: "Floor",
      };
      const actions = [voiceVoteAction];
      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "HR",
        billNumber: "2815",
      });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].recordedVotes!.length, 1);
      assert.strictEqual(result[0].recordedVotes![0].chamber, "House", "API uses 'House floor actions' for House");
    });

    test("should set result rejected for voice vote when noes prevailed", async () => {
      const voiceVoteAction = {
        actionDate: "2024-06-15",
        text: "On the motion to recommit. Motion rejected by voice vote. The noes had prevailed.",
        sourceSystem: { name: "House" },
        type: "Floor",
      };
      const actions = [voiceVoteAction];
      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "HR",
        billNumber: "1",
      });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].recordedVotes![0].result, "rejected");
    });

    test("should populate House passage by unanimous consent with UC for each representative", async () => {
      const ucAction = {
        actionCode: "H37100",
        actionDate: "2024-06-15",
        text: "On passage Passed without objection. (text: CR H2955)",
        sourceSystem: { code: 2, name: "House floor actions" },
        type: "Floor",
      };
      const actions = [ucAction];
      const result = await congressApi.populateRecordedVotes(actions as any, {
        congress: 119,
        billType: "HR",
        billNumber: "8322",
      });
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].recordedVotes);
      assert.strictEqual(result[0].recordedVotes!.length, 1);
      const rv = result[0].recordedVotes![0];
      assert.strictEqual(rv.chamber, "House");
      assert.strictEqual(rv.result, "passed");
      assert.strictEqual(rv.question, "Pass with Unanimous Consent");
      assert.strictEqual(rv.rollNumber, 0);
      assert.ok(rv.votes, "votes map should be populated");
      const voteValues = Object.values(rv.votes!);
      assert.ok(voteValues.length > 0, "should have at least one rep with vote");
      assert.ok(voteValues.every((v) => v === "UC"), "all reps should be marked UC");
      // House UC should not produce senateCount
      assert.strictEqual((rv as any).senateCount, undefined);
      assert.ok(Array.isArray(rv.votePartyTotal));
    });

    test("should not synthesize House UC when actual recordedVotes exist on the action", async () => {
      const action = {
        actionCode: "H37100",
        actionDate: "2026-04-17",
        text: "On passage Passed by recorded vote: 220 - 200.",
        sourceSystem: { code: 2, name: "House floor actions" },
        type: "Floor",
        recordedVotes: [
          {
            chamber: "House",
            congress: 119,
            date: "2026-04-17T12:00:00Z",
            rollNumber: 200,
            sessionNumber: 1,
            url: "https://clerk.house.gov/evs/2026/roll200.xml",
          },
        ],
      };
      const result = await congressApi.populateRecordedVotes([action] as any, {
        congress: 119,
        billType: "HR",
        billNumber: "1",
      });
      // Should keep the original recordedVote, not replace it with a synthetic UC vote
      assert.strictEqual(result[0].recordedVotes!.length, 1);
      assert.strictEqual(result[0].recordedVotes![0].rollNumber, 200);
    });
  });
});
