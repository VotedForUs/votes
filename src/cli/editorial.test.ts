/**
 * Tests for editorial content generation
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { 
  getBestBillTitle, 
  extractBillTitles, 
  extractDefaultQuestions,
  generateEditorialFile,
  generateEditorial,
} from "./editorial.js";
import type { BillWithActions } from "../congress/congress-api.types.js";

// Test fixtures
const createMockBill = (overrides: Partial<BillWithActions> = {}): BillWithActions => ({
  id: "119-HR-1",
  congress: 119,
  number: "1",
  type: "HR",
  title: "Default Bill Title",
  updateDate: "2025-01-01",
  originChamber: "House",
  originChamberCode: "H",
  actions: {
    count: 0,
    url: "",
    actions: [],
  },
  ...overrides,
});

describe("editorial", () => {
  describe("getBestBillTitle", () => {
    it("should return 'Popular Titles' when available", () => {
      const bill = createMockBill({
        titles: {
          titles: [
            { title: "Official Title", titleType: "Official Title as Introduced", titleTypeCode: 6, updateDate: "" },
            { title: "Popular Title", titleType: "Popular Titles", titleTypeCode: 30, updateDate: "" },
          ],
        },
      });
      
      const result = getBestBillTitle(bill);
      assert.strictEqual(result, "Popular Title");
    });

    it("should return 'Short Title' types before 'Official Title'", () => {
      const bill = createMockBill({
        titles: {
          titles: [
            { title: "Official Title", titleType: "Official Title as Introduced", titleTypeCode: 6, updateDate: "" },
            { title: "Short Title House", titleType: "Short Title(s) as Passed House", titleTypeCode: 104, updateDate: "" },
          ],
        },
      });
      
      const result = getBestBillTitle(bill);
      assert.strictEqual(result, "Short Title House");
    });

    it("should fallback to first title if no priority match", () => {
      const bill = createMockBill({
        titles: {
          titles: [
            { title: "Some Other Title", titleType: "Some Other Type", titleTypeCode: 999, updateDate: "" },
          ],
        },
      });
      
      const result = getBestBillTitle(bill);
      assert.strictEqual(result, "Some Other Title");
    });

    it("should fallback to bill.title if no titles array", () => {
      const bill = createMockBill({
        title: "Bill Main Title",
        titles: undefined,
      });
      
      const result = getBestBillTitle(bill);
      assert.strictEqual(result, "Bill Main Title");
    });

    it("should return empty string if no title available", () => {
      const bill = createMockBill({
        title: undefined,
        titles: undefined,
      });
      
      const result = getBestBillTitle(bill as BillWithActions);
      assert.strictEqual(result, "");
    });
  });

  describe("extractBillTitles", () => {
    it("should extract unique titles from bill.titles.titles", () => {
      const bill = createMockBill({
        title: "Main Title",
        titles: {
          titles: [
            { title: "Title A", titleType: "Type A", titleTypeCode: 1, updateDate: "" },
            { title: "Title B", titleType: "Type B", titleTypeCode: 2, updateDate: "" },
            { title: "Title A", titleType: "Type C", titleTypeCode: 3, updateDate: "" }, // Duplicate
          ],
        },
      });
      
      const result = extractBillTitles(bill);
      assert.deepStrictEqual(result, ["Title A", "Title B", "Main Title"]);
    });

    it("should include bill.title if not in titles array", () => {
      const bill = createMockBill({
        title: "Unique Main Title",
        titles: {
          titles: [
            { title: "Other Title", titleType: "Type A", titleTypeCode: 1, updateDate: "" },
          ],
        },
      });
      
      const result = extractBillTitles(bill);
      assert.ok(result.includes("Unique Main Title"));
      assert.ok(result.includes("Other Title"));
    });

    it("should return array with bill.title if no titles", () => {
      const bill = createMockBill({
        title: "Only Title",
        titles: undefined,
      });
      
      const result = extractBillTitles(bill);
      assert.deepStrictEqual(result, ["Only Title"]);
    });

    it("should return empty array if no titles available", () => {
      const bill = createMockBill({
        title: undefined,
        titles: undefined,
      });
      
      const result = extractBillTitles(bill as BillWithActions);
      assert.deepStrictEqual(result, []);
    });
  });

  describe("extractDefaultQuestions", () => {
    it("should extract questions from recorded votes", () => {
      const bill = createMockBill({
        actions: {
          count: 2,
          url: "",
          actions: [
            {
              actionDate: "2025-01-01",
              text: "Action 1",
              type: "Vote",
              recordedVotes: [
                { id: "119-HR-1-1", question: "On Passage", chamber: "House", date: "2025-01-01", rollNumber: 1, congress: 119, sessionNumber: 1, url: "" },
                { id: "119-HR-1-2", question: "On Motion", chamber: "Senate", date: "2025-01-02", rollNumber: 2, congress: 119, sessionNumber: 1, url: "" },
              ],
            },
            {
              actionDate: "2025-01-02",
              text: "Action 2",
              type: "Other",
            },
          ],
        },
      });
      
      const result = extractDefaultQuestions(bill);
      assert.deepStrictEqual(result, {
        "119-HR-1-1": "On Passage",
        "119-HR-1-2": "On Motion",
      });
    });

    it("should return empty object if no actions", () => {
      const bill = createMockBill({
        actions: undefined,
      });
      
      const result = extractDefaultQuestions(bill as BillWithActions);
      assert.deepStrictEqual(result, {});
    });

    it("should skip votes without id or question", () => {
      const bill = createMockBill({
        actions: {
          count: 1,
          url: "",
          actions: [
            {
              actionDate: "2025-01-01",
              text: "Action",
              type: "Vote",
              recordedVotes: [
                { id: "119-HR-1-1", question: "Valid Question", chamber: "House", date: "2025-01-01", rollNumber: 1, congress: 119, sessionNumber: 1, url: "" },
                { question: "No ID", chamber: "House", date: "2025-01-01", rollNumber: 2, congress: 119, sessionNumber: 1, url: "" } as any,
                { id: "119-HR-1-3", chamber: "House", date: "2025-01-01", rollNumber: 3, congress: 119, sessionNumber: 1, url: "" } as any,
              ],
            },
          ],
        },
      });
      
      const result = extractDefaultQuestions(bill);
      assert.deepStrictEqual(result, {
        "119-HR-1-1": "Valid Question",
      });
    });
  });

  describe("generateEditorialFile", () => {
    const testDir = path.join(process.cwd(), ".test-editorial");
    
    beforeEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
      fs.mkdirSync(testDir, { recursive: true });
    });
    
    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });
    
    it("should create new editorial file", () => {
      const bill = createMockBill({
        title: "Test Bill",
        titles: {
          titles: [
            { title: "Popular Title", titleType: "Popular Titles", titleTypeCode: 30, updateDate: "" },
          ],
        },
        actions: {
          count: 1,
          url: "",
          actions: [
            {
              actionDate: "2025-01-01",
              text: "Action",
              type: "Vote",
              recordedVotes: [
                { id: "119-HR-1-1", question: "On Passage", chamber: "House", date: "2025-01-01", rollNumber: 1, congress: 119, sessionNumber: 1, url: "" },
              ],
            },
          ],
        },
      });
      
      const outputPath = path.join(testDir, "1.json");
      const result = generateEditorialFile(bill, outputPath);
      
      assert.strictEqual(result.created, true);
      assert.strictEqual(result.updated, false);
      assert.ok(fs.existsSync(outputPath));
      
      const content = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      assert.strictEqual(content.defaultTitle, "Popular Title");
      assert.deepStrictEqual(content.billTitles, ["Popular Title", "Test Bill"]);
      assert.deepStrictEqual(content.defaultQuestions, { "119-HR-1-1": "On Passage" });
      assert.strictEqual(content.title, undefined);
      assert.strictEqual(content.questions, undefined);
    });

    it("should preserve user-defined title when updating", () => {
      const outputPath = path.join(testDir, "1.json");
      
      // Create existing file with user-defined title
      fs.writeFileSync(outputPath, JSON.stringify({
        title: "My Custom Title",
        defaultTitle: "Old Default",
        billTitles: ["Old Title"],
        defaultQuestions: {},
      }), "utf8");
      
      const bill = createMockBill({
        title: "New Title",
        titles: {
          titles: [
            { title: "Updated Popular Title", titleType: "Popular Titles", titleTypeCode: 30, updateDate: "" },
          ],
        },
      });
      
      const result = generateEditorialFile(bill, outputPath);
      
      assert.strictEqual(result.created, false);
      assert.strictEqual(result.updated, true);
      
      const content = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      assert.strictEqual(content.title, "My Custom Title"); // Preserved
      assert.strictEqual(content.defaultTitle, "Updated Popular Title"); // Updated
    });

    it("should preserve user-defined questions when updating", () => {
      const outputPath = path.join(testDir, "1.json");
      
      // Create existing file with user-defined questions
      fs.writeFileSync(outputPath, JSON.stringify({
        defaultTitle: "Old Default",
        billTitles: ["Old Title"],
        questions: { "119-HR-1-1": "Custom Question" },
        defaultQuestions: { "119-HR-1-1": "Old Default Question" },
      }), "utf8");
      
      const bill = createMockBill({
        title: "Title",
        actions: {
          count: 1,
          url: "",
          actions: [
            {
              actionDate: "2025-01-01",
              text: "Action",
              type: "Vote",
              recordedVotes: [
                { id: "119-HR-1-1", question: "New Default Question", chamber: "House", date: "2025-01-01", rollNumber: 1, congress: 119, sessionNumber: 1, url: "" },
              ],
            },
          ],
        },
      });
      
      const result = generateEditorialFile(bill, outputPath);
      
      const content = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      assert.deepStrictEqual(content.questions, { "119-HR-1-1": "Custom Question" }); // Preserved
      assert.deepStrictEqual(content.defaultQuestions, { "119-HR-1-1": "New Default Question" }); // Updated
    });

    it("should not include empty questions object", () => {
      const outputPath = path.join(testDir, "1.json");
      
      // Create existing file with empty questions
      fs.writeFileSync(outputPath, JSON.stringify({
        defaultTitle: "Default",
        billTitles: ["Title"],
        questions: {},
        defaultQuestions: {},
      }), "utf8");
      
      const bill = createMockBill({
        title: "Title",
      });
      
      generateEditorialFile(bill, outputPath);
      
      const content = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      assert.strictEqual(content.questions, undefined);
    });
  });

  describe("generateEditorial", () => {
    const testSourceDir = path.join(process.cwd(), ".test-source");
    const testOutputDir = path.join(process.cwd(), ".test-output");
    
    beforeEach(() => {
      for (const dir of [testSourceDir, testOutputDir]) {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true });
        }
      }
      fs.mkdirSync(path.join(testSourceDir, "bills", "119", "hr"), { recursive: true });
    });
    
    afterEach(() => {
      for (const dir of [testSourceDir, testOutputDir]) {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true });
        }
      }
    });

    it("should process bills from source directory", async () => {
      // Create source bill at bills/{congress}/{billType}/
      const bill = createMockBill({
        number: "1",
        type: "HR",
        title: "Test Bill",
        titles: {
          titles: [
            { title: "Popular Title", titleType: "Popular Titles", titleTypeCode: 30, updateDate: "" },
          ],
        },
      });
      fs.writeFileSync(
        path.join(testSourceDir, "bills", "119", "hr", "1.json"),
        JSON.stringify(bill),
        "utf8"
      );
      
      const result = await generateEditorial({
        term: 119,
        sourceDir: testSourceDir,
        outputDir: testOutputDir,
        billType: "hr",
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.created, 1);
      assert.strictEqual(result.updated, 0);
      
      const outputPath = path.join(testOutputDir, "119", "hr", "1.json");
      assert.ok(fs.existsSync(outputPath));
      
      const content = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      assert.strictEqual(content.defaultTitle, "Popular Title");
    });
  });
});
