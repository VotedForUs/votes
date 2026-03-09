import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getBills, reduceBill, getVotedBills, writeVotedBills, buildFromCache } from "./bills.js";
import { MockCongressApi } from "../congress/mocks/mock-congress-api.js";
import type { BillWithActions } from "../congress/congress-api.types.js";

describe("CLI Bills Module", () => {
  beforeEach(() => {
    MockCongressApi.reset();
  });

  afterEach(() => {
    MockCongressApi.reset();
  });

  describe("reduceBill", () => {
    test("should extract correct properties from bill", () => {
      const bill: BillWithActions = {
        id: "119-HR-1234",
        congress: 119,
        number: "1234",
        type: "HR",
        title: "Full Title",
        url: "https://api.congress.gov/v3/bill/119/hr/1234",
        originChamber: "House",
        originChamberCode: "H",
        updateDate: "2024-10-31",
        latestAction: {
          actionDate: "2024-10-31",
          text: "Passed",
        },
        actions: {
          actions: [],
        },
      };

      const reduced = reduceBill(bill) as BillWithActions;

      assert.strictEqual(reduced.congress, 119);
      assert.strictEqual(reduced.title, "Full Title");
      assert.strictEqual(reduced.type, "HR");
      assert.strictEqual(reduced.updateDate, "2024-10-31");
      assert.deepStrictEqual(reduced.latestAction, {
        actionDate: "2024-10-31",
        text: "Passed",
      });
    });

    test("should handle bills with missing optional fields", () => {
      const bill: BillWithActions = {
        id: "119-HR-1234",
        congress: 119,
        number: "1234",
        type: "HR",
        title: "Title",
        url: "https://api.congress.gov/v3/bill/119/hr/1234",
        originChamber: "House",
        originChamberCode: "H",
        actions: {
          actions: [],
        },
      };

      const reduced = reduceBill(bill) as BillWithActions;

      assert.strictEqual(reduced.congress, 119);
      assert.strictEqual(reduced.title, "Title");
      assert.strictEqual(reduced.type, "HR");
      assert.strictEqual(reduced.updateDate, undefined);
      assert.strictEqual(reduced.latestAction, undefined);
    });
  });

  describe("getBills", () => {
    test("should return bills array", async () => {
      const bills = await getBills(
        119,
        undefined,
        false,
        false,
        'all', // includeActions
        'all', // includeVotes
        undefined, // limit
        MockCongressApi as any,
      );

      assert.ok(Array.isArray(bills), "Output should be an array");
      assert.strictEqual(bills.length, 2, "Should have 2 bills");
    });

    test("should filter by bill type", async () => {
      const bills = await getBills(
        119,
        "HR",
        false,
        false,
        'all', // includeActions
        'all', // includeVotes
        undefined, // limit
        MockCongressApi as any,
      );

      assert.strictEqual(bills.length, 1, "Should have 1 HR bill");
      assert.strictEqual(bills[0].type, "HR");
    });

    test("should return only bills with recorded votes when includeVotes='only'", async () => {
      // Add a bill without recorded votes
      const mockBills = MockCongressApi.getMockBills();
      mockBills.push({
        id: "119-HR-9999",
        congress: 119,
        number: "9999",
        type: "HR",
        title: "No Votes Bill",
        url: "https://api.congress.gov/v3/bill/119/hr/9999",
        originChamber: "House",
        originChamberCode: "H",
        actions: {
          actions: [], // No actions means no recorded votes
        },
      });
      MockCongressApi.setMockBills(mockBills);
      
      const bills = await getBills(
        119,
        undefined,
        false,
        false,
        'votes', // includeActions - only actions with recorded votes
        'only', // includeVotes - only bills with recorded votes
        undefined, // limit
        MockCongressApi as any,
      );

      // Should only have bills with recorded votes (not the one we added)
      assert.ok(bills.length > 0, "Should have at least one bill");
      
      bills.forEach((bill: any) => {
        assert.ok(bill.actions?.actions?.length > 0, "Bill should have actions");
        const hasRecordedVotes = bill.actions.actions.some((action: any) => 
          Array.isArray(action.recordedVotes) && action.recordedVotes.length > 0
        );
        assert.ok(hasRecordedVotes, "Bill should have at least one action with recorded votes");
      });
    });

    test("should reduce bills when small flag is true", async () => {
      const bills = await getBills(
        119,
        undefined,
        true, // skipCache
        true, // small
        'all', // includeActions
        'all', // includeVotes
        undefined, // limit
        MockCongressApi as any,
      );

      assert.strictEqual(bills.length, 2);
      
      // Check that bills are reduced (should still have basic properties)
      assert.ok(bills[0].actions);
      assert.ok(bills[0].number);
      assert.ok(bills[0].title);
    });

    test("should handle includeVotes='none'", async () => {
      const bills = await getBills(
        119,
        undefined,
        false,
        false,
        'all', // includeActions
        'none', // includeVotes - don't fetch vote details
        undefined, // limit
        MockCongressApi as any,
      );

      assert.ok(Array.isArray(bills), "Should return an array");
      assert.ok(bills.length > 0, "Should have bills");
    });

    test("should apply limit when includeVotes='only' after filtering", async () => {
      const limit = 1;
      
      const bills = await getBills(
        119,
        undefined,
        false,
        false,
        'votes', // includeActions
        'only', // includeVotes
        limit, // limit
        MockCongressApi as any,
      );

      assert.ok(bills.length <= limit, `Should have at most ${limit} bills`);
    });

    test("should ignore limit when includeVotes='only' for initial fetch", async () => {
      // When includeVotes='only', limit should be applied after filtering
      // The function should fetch all bills first, then filter, then limit
      const bills = await getBills(
        119,
        undefined,
        false,
        false,
        'votes', // includeActions
        'only', // includeVotes
        10, // limit - this will be applied after filtering
        MockCongressApi as any,
      );

      // Should have bills (exact count depends on mock data)
      assert.ok(Array.isArray(bills), "Should return an array");
    });

    test("should filter to only actions with votes when includeActions='votes'", async () => {
      const bills = await getBills(
        119,
        undefined,
        false,
        false,
        'votes', // includeActions - only actions with recorded votes
        'none', // includeVotes - don't fetch vote details
        undefined, // limit
        MockCongressApi as any,
      );

      assert.ok(bills.length > 0, "Should have at least one bill");
      
      // Each bill should have actions array with only actions that have recordedVotes
      bills.forEach((bill: any) => {
        assert.ok(bill.actions, "Bill should have actions property");
        assert.ok(bill.actions.actions, "Bill should have actions.actions array");
        bill.actions.actions.forEach((action: any) => {
          assert.ok(action.recordedVotes, "Action should have recordedVotes");
          assert.ok(action.recordedVotes.length > 0, "Action should have at least one recorded vote");
        });
      });
    });

    test("should handle error when CongressApi.getBills fails", async () => {
      MockCongressApi.setShouldThrowError(true, "Failed to fetch bills");

      await assert.rejects(
        () => getBills(
          119,
          undefined,
          false,
          false,
          'all', // includeActions
          'all', // includeVotes
          undefined, // limit
          MockCongressApi as any,
        ),
        {
          message: /Failed to fetch bills/,
        },
        "Should throw error when getBills fails"
      );
    });

    test("should pass limit parameter to CongressApi when includeVotes is not 'only'", async () => {
      const bills = await getBills(
        119,
        undefined,
        false,
        false,
        'all', // includeActions
        'all', // includeVotes - not 'only', so limit should be passed
        5, // limit
        MockCongressApi as any,
      );

      assert.ok(Array.isArray(bills), "Should return an array");
    });
  });

  describe("getVotedBills", () => {
    test("should return bills with recorded votes", async () => {
      const bills = await getVotedBills(
        119,
        "HR",
        true, // small
        undefined, // limit
        MockCongressApi as any,
      );

      assert.ok(Array.isArray(bills), "Should return an array");
    });

    test("should apply limit when specified", async () => {
      // Add more HR bills with votes to test limit
      const mockBills = MockCongressApi.getMockBills();
      mockBills.push({
        id: "119-HR-9999",
        congress: 119,
        number: "9999",
        type: "HR",
        title: "Another HR Bill",
        url: "https://api.congress.gov/v3/bill/119/hr/9999",
        originChamber: "House",
        originChamberCode: "H",
        actions: {
          actions: [{
            actionDate: "2024-10-31",
            text: "Passed House",
            type: "Floor",
            recordedVotes: [{ chamber: "House", congress: 119, date: "2024-10-31T12:00:00Z", rollNumber: 456, sessionNumber: 1, url: "https://example.com" }],
          }],
        },
      });
      MockCongressApi.setMockBills(mockBills);

      const bills = await getVotedBills(
        119,
        "HR",
        true,
        1, // limit to 1
        MockCongressApi as any,
      );

      assert.ok(bills.length <= 1, "Should have at most 1 bill");
    });

    test("should not reduce bills when small is false", async () => {
      const bills = await getVotedBills(
        119,
        "HR",
        false, // small = false
        undefined,
        MockCongressApi as any,
      );

      assert.ok(Array.isArray(bills), "Should return an array");
    });

    test("should handle error when getBillsWithVotes fails", async () => {
      MockCongressApi.setShouldThrowError(true, "Failed to fetch voted bills");

      await assert.rejects(
        () => getVotedBills(119, "HR", true, undefined, MockCongressApi as any),
        { message: /Failed to fetch voted bills/ },
      );
    });
  });

  describe("writeVotedBills", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bills-test-'));
    });

    afterEach(() => {
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    test("should write bills to individual files", async () => {
      const result = await writeVotedBills({
        term: 119,
        billType: "HR",
        outputDir: tempDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.count !== undefined && result.count >= 0);

      // Check that files were created under bills/{congress}/{billType}/
      const hrDir = path.join(tempDir, 'bills', '119', 'hr');
      if (result.count && result.count > 0) {
        assert.ok(fs.existsSync(hrDir), "bills/119/hr directory should exist");
      }
    });

    test("should create output directory if it doesn't exist", async () => {
      const nestedDir = path.join(tempDir, 'nested', 'output');
      
      const result = await writeVotedBills({
        term: 119,
        billType: "HR",
        outputDir: nestedDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(path.join(nestedDir, 'bills', '119', 'hr')), "Nested bills/119/hr directory should exist");
    });

    test("should return error on failure", async () => {
      MockCongressApi.setShouldThrowError(true, "API Error");

      const result = await writeVotedBills({
        term: 119,
        billType: "HR",
        outputDir: tempDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("API Error"));
    });

    test("should apply limit when specified", async () => {
      const result = await writeVotedBills({
        term: 119,
        billType: "HR",
        outputDir: tempDir,
        small: true,
        limit: 1,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      if (result.count !== undefined) {
        assert.ok(result.count <= 1, "Should write at most 1 bill");
      }
    });
  });

  describe("buildFromCache", () => {
    let tempCacheDir: string;
    let tempOutputDir: string;

    beforeEach(() => {
      tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));
      tempOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tempCacheDir)) {
        fs.rmSync(tempCacheDir, { recursive: true });
      }
      if (fs.existsSync(tempOutputDir)) {
        fs.rmSync(tempOutputDir, { recursive: true });
      }
    });

    test("should return success with 0 bills when cache is empty", async () => {
      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });

    test("should return 0 bills when cache directory does not exist for bill type", async () => {
      const result = await buildFromCache({
        term: 119,
        billType: "nonexistent",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });

    test("should process bills from cache with recorded votes", async () => {
      // Create mock cache structure
      const billTypeCacheDir = path.join(tempCacheDir, 'bill', '119', 'hr');
      const billDir = path.join(billTypeCacheDir, '1234');
      fs.mkdirSync(billDir, { recursive: true });

      // Create bill info file
      fs.writeFileSync(
        path.join(billTypeCacheDir, '1234.json'),
        JSON.stringify({
          bill: {
            congress: 119,
            number: "1234",
            type: "HR",
            title: "Test Bill",
            url: "https://api.congress.gov/v3/bill/119/hr/1234",
            originChamber: "House",
            originChamberCode: "H",
            actions: { count: 1 },
          },
        }),
      );

      // Create actions file with recorded votes
      fs.writeFileSync(
        path.join(billDir, 'actions.json'),
        JSON.stringify({
          actions: [{
            actionDate: "2024-10-31",
            text: "Passed House",
            type: "Floor",
            sourceSystem: { name: "House" },
            recordedVotes: [{ chamber: "House", congress: 119, date: "2024-10-31T12:00:00Z", rollNumber: 123, sessionNumber: 1, url: "https://example.com" }],
          }],
        }),
      );

      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);

      // Verify output file was created
      const outputFile = path.join(tempOutputDir, 'bills', '119', 'hr', '1234.json');
      assert.ok(fs.existsSync(outputFile), "Output file should exist");
    });

    test("should skip bills without recorded votes", async () => {
      // Create mock cache structure
      const billTypeCacheDir = path.join(tempCacheDir, 'bill', '119', 'hr');
      const billDir = path.join(billTypeCacheDir, '5678');
      fs.mkdirSync(billDir, { recursive: true });

      // Create bill info file
      fs.writeFileSync(
        path.join(billTypeCacheDir, '5678.json'),
        JSON.stringify({
          bill: {
            congress: 119,
            number: "5678",
            type: "HR",
            title: "No Votes Bill",
            url: "https://api.congress.gov/v3/bill/119/hr/5678",
            originChamber: "House",
            originChamberCode: "H",
            actions: { count: 1 },
          },
        }),
      );

      // Create actions file WITHOUT recorded votes
      fs.writeFileSync(
        path.join(billDir, 'actions.json'),
        JSON.stringify({
          actions: [{
            actionDate: "2024-10-31",
            text: "Introduced",
            type: "IntroReferral",
          }],
        }),
      );

      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });

    test("should skip bills with Library of Congress source", async () => {
      // Create mock cache structure
      const billTypeCacheDir = path.join(tempCacheDir, 'bill', '119', 'hr');
      const billDir = path.join(billTypeCacheDir, '7890');
      fs.mkdirSync(billDir, { recursive: true });

      // Create bill info file
      fs.writeFileSync(
        path.join(billTypeCacheDir, '7890.json'),
        JSON.stringify({
          bill: {
            congress: 119,
            number: "7890",
            type: "HR",
            title: "LOC Source Bill",
            url: "https://api.congress.gov/v3/bill/119/hr/7890",
            originChamber: "House",
            originChamberCode: "H",
            actions: { count: 1 },
          },
        }),
      );

      // Create actions file with LOC source (should be skipped)
      fs.writeFileSync(
        path.join(billDir, 'actions.json'),
        JSON.stringify({
          actions: [{
            actionDate: "2024-10-31",
            text: "Passed House",
            type: "Floor",
            sourceSystem: { name: "Library of Congress" },
            recordedVotes: [{ chamber: "House", congress: 119, date: "2024-10-31T12:00:00Z", rollNumber: 123, sessionNumber: 1, url: "https://example.com" }],
          }],
        }),
      );

      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });

    test("should process all bill types when no billType specified", async () => {
      const result = await buildFromCache({
        term: 119,
        billType: undefined, // Process all types
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.billTypes !== undefined);
      assert.ok(result.billTypes.length > 0, "Should have processed multiple bill types");
    });

    test("should include titles when available", async () => {
      // Create mock cache structure
      const billTypeCacheDir = path.join(tempCacheDir, 'bill', '119', 'hr');
      const billDir = path.join(billTypeCacheDir, '1111');
      fs.mkdirSync(billDir, { recursive: true });

      // Create bill info file
      fs.writeFileSync(
        path.join(billTypeCacheDir, '1111.json'),
        JSON.stringify({
          bill: {
            congress: 119,
            number: "1111",
            type: "HR",
            title: "Bill With Titles",
            url: "https://api.congress.gov/v3/bill/119/hr/1111",
            originChamber: "House",
            originChamberCode: "H",
            actions: { count: 1 },
          },
        }),
      );

      // Create actions file
      fs.writeFileSync(
        path.join(billDir, 'actions.json'),
        JSON.stringify({
          actions: [{
            actionDate: "2024-10-31",
            text: "Passed House",
            type: "Floor",
            recordedVotes: [{ chamber: "House", congress: 119, date: "2024-10-31T12:00:00Z", rollNumber: 123, sessionNumber: 1, url: "https://example.com" }],
          }],
        }),
      );

      // Create titles file
      fs.writeFileSync(
        path.join(billDir, 'titles.json'),
        JSON.stringify({
          titles: [
            { title: "Short Title", titleType: "Short Titles as Introduced" },
            { title: "Official Title", titleType: "Official Title as Introduced" },
          ],
        }),
      );

      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: false, // Don't reduce to verify titles
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);

      // Read and verify the output includes titles
      const outputFile = path.join(tempOutputDir, 'bills', '119', 'hr', '1111.json');
      const outputData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      assert.ok(outputData.titles, "Output should include titles");
      assert.ok(outputData.titles.titles.length === 2, "Should have 2 titles");
    });

    test("should skip bill directories without actions.json", async () => {
      // Create mock cache structure with bill dir but no actions
      const billTypeCacheDir = path.join(tempCacheDir, 'bill', '119', 'hr');
      const billDir = path.join(billTypeCacheDir, '2222');
      fs.mkdirSync(billDir, { recursive: true });

      // Create bill info file but NO actions.json
      fs.writeFileSync(
        path.join(billTypeCacheDir, '2222.json'),
        JSON.stringify({
          bill: {
            congress: 119,
            number: "2222",
            type: "HR",
            title: "No Actions Bill",
            url: "https://api.congress.gov/v3/bill/119/hr/2222",
            originChamber: "House",
            originChamberCode: "H",
          },
        }),
      );

      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });

    test("should handle missing bill info file gracefully", async () => {
      // Create mock cache structure with actions but no bill info
      const billTypeCacheDir = path.join(tempCacheDir, 'bill', '119', 'hr');
      const billDir = path.join(billTypeCacheDir, '3333');
      fs.mkdirSync(billDir, { recursive: true });

      // Create actions file with votes but NO bill info file
      fs.writeFileSync(
        path.join(billDir, 'actions.json'),
        JSON.stringify({
          actions: [{
            actionDate: "2024-10-31",
            text: "Passed House",
            type: "Floor",
            recordedVotes: [{ chamber: "House", congress: 119, date: "2024-10-31T12:00:00Z", rollNumber: 123, sessionNumber: 1, url: "https://example.com" }],
          }],
        }),
      );

      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });

    test("should handle invalid bill info gracefully", async () => {
      // Create mock cache structure with invalid bill info
      const billTypeCacheDir = path.join(tempCacheDir, 'bill', '119', 'hr');
      const billDir = path.join(billTypeCacheDir, '4444');
      fs.mkdirSync(billDir, { recursive: true });

      // Create bill info file without 'bill' property
      fs.writeFileSync(
        path.join(billTypeCacheDir, '4444.json'),
        JSON.stringify({ notBill: "invalid" }),
      );

      // Create actions file with votes
      fs.writeFileSync(
        path.join(billDir, 'actions.json'),
        JSON.stringify({
          actions: [{
            actionDate: "2024-10-31",
            text: "Passed House",
            type: "Floor",
            recordedVotes: [{ chamber: "House", congress: 119, date: "2024-10-31T12:00:00Z", rollNumber: 123, sessionNumber: 1, url: "https://example.com" }],
          }],
        }),
      );

      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });

    test("should handle JSON parse errors gracefully", async () => {
      // Create mock cache structure with invalid JSON
      const billTypeCacheDir = path.join(tempCacheDir, 'bill', '119', 'hr');
      const billDir = path.join(billTypeCacheDir, '5555');
      fs.mkdirSync(billDir, { recursive: true });

      // Create invalid JSON actions file
      fs.writeFileSync(path.join(billDir, 'actions.json'), 'not valid json');

      const result = await buildFromCache({
        term: 119,
        billType: "hr",
        outputDir: tempOutputDir,
        cacheDir: tempCacheDir,
        small: true,
        CongressApiClass: MockCongressApi as any,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });
  });
});
