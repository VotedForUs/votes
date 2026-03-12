import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import mock from "mock-fs";
import fs from "node:fs";
import { getLegislators, reduceLegislator, buildLegislatorsFromCache } from "./legislators.js";
import { wrapFsWithThrow } from "../utils/mocks/wrap-fs-with-throw.js";
import { MockLegislators, mockLegislatorsOutput } from "../legislators/mocks/mock-legislators.js";
import type { Legislator } from "../legislators/legislators.types.js";

describe("CLI Legislators Module", () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mock({});
    MockLegislators.reset();
  });

  afterEach(() => {
    mock.restore();
    MockLegislators.reset();
    process.chdir(originalCwd);
  });

  // Helper function to call getLegislators with default mock dependencies
  const callGetLegislators = async (
    outputDir?: string,
    currentMember: boolean = false,
    small: boolean = false,
    fsModule: typeof fs = fs,
  ) => {
    return getLegislators(
      outputDir,
      currentMember,
      small,
      undefined,
      fsModule,
      MockLegislators as any,
    );
  };

  // Helper to get written file content (per-file output: outputDir/bioguideid.json)
  const getWrittenContent = (outputDir: string, bioguideId: string = "A000001"): any => {
    const filePath = `${outputDir.replace(/\/$/, "")}/${bioguideId}.json`;
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return content ? JSON.parse(content) : null;
  };

  describe("reduceLegislator", () => {
    test("should reduce representative with all required fields", () => {
      const legislator: Legislator = {
        bioguideId: "A000001",
        name: {
          official_full: "Alex Anderson",
          last: "Anderson",
        },
        latest_term: {
          type: "rep",
          state: "CA",
          district: 1,
          party: "Democrat",
        },
        depiction: {
          imageUrl: "https://example.com/image.jpg",
          attribution: "Photo credit",
        },
        lis_member_id: "LIS123",
      } as Legislator;

      const reduced = reduceLegislator(legislator);

      assert.strictEqual(reduced.id, "A000001");
      assert.strictEqual(reduced.bioguide, "A000001");
      assert.strictEqual(reduced.name, "Alex Anderson");
      assert.strictEqual(reduced.lastName, "Anderson");
      assert.strictEqual(reduced.state, "CA");
      assert.strictEqual(reduced.party, "Democrat");
      assert.strictEqual(reduced.district, 1);
      assert.strictEqual(reduced.nameTitle, "Rep. Alex Anderson (CA-1)");
      assert.strictEqual(reduced.imageUrl, "https://example.com/image.jpg");
      assert.strictEqual(reduced.attribution, "Photo credit");
      assert.strictEqual(reduced.type, "rep");
      assert.strictEqual(reduced.lis_member_id, "LIS123");
      assert.strictEqual(reduced.stateRank, undefined);
    });

    test("should reduce senator with state rank", () => {
      const legislator: Legislator = {
        bioguideId: "S000001",
        name: {
          official_full: "Sarah Smith",
          last: "Smith",
        },
        latest_term: {
          type: "sen",
          state: "NY",
          party: "Republican",
          state_rank: "senior",
        },
        lis_member_id: "LIS456",
      } as Legislator;

      const reduced = reduceLegislator(legislator);

      assert.strictEqual(reduced.id, "S000001");
      assert.strictEqual(reduced.nameTitle, "Sen. Sarah Smith (NY)");
      assert.strictEqual(reduced.type, "sen");
      assert.strictEqual(reduced.stateRank, "senior");
      assert.strictEqual(reduced.district, undefined);
    });

    test("should handle legislator with missing optional fields", () => {
      const legislator: Legislator = {
        bioguideId: "M000001",
        name: {
          official_full: "Mike Miller",
          last: "Miller",
        },
        latest_term: {
          type: "rep",
          state: "TX",
          district: 5,
          party: "Independent",
        },
      } as Legislator;

      const reduced = reduceLegislator(legislator);

      assert.strictEqual(reduced.id, "M000001");
      assert.strictEqual(reduced.imageUrl, undefined);
      assert.strictEqual(reduced.attribution, undefined);
      assert.strictEqual(reduced.lis_member_id, undefined);
    });
  });

  describe("getLegislators", () => {
    test("should generate legislators with default path", async () => {
      const defaultDir = `${process.cwd()}/.cache/legislators`;
      await callGetLegislators();
      assert.ok(fs.existsSync(`${defaultDir}/A000001.json`), "File should be written to default dir");
      const leg = getWrittenContent(defaultDir);
      assert.ok(leg, "Should have one legislator file");
      assert.strictEqual(leg.bioguideId ?? leg.bioguide, "A000001");
    });

    test("should generate legislators with custom path", async () => {
      const customDir = "/custom/path/legislators";
      await callGetLegislators(customDir);
      assert.ok(fs.existsSync(`${customDir}/A000001.json`), "File should be written to custom dir");
      const leg = getWrittenContent(customDir);
      assert.ok(leg);
    });

    test("should create output directory if it doesn't exist", async () => {
      const outputDir = "/deep/nested/path";
      await callGetLegislators(outputDir);
      assert.ok(fs.existsSync(`${outputDir}/A000001.json`), "File should be written");
      assert.ok(fs.existsSync("/deep/nested/path"), "Directory should be created");
    });

    test("should write valid JSON to file", async () => {
      const outputDir = "/test";
      await callGetLegislators(outputDir);
      const leg = getWrittenContent(outputDir);
      assert.ok(leg, "Should be valid JSON object");
    });

    test("should write legislators data received from Legislators class", async () => {
      const outputDir = "/test";
      await callGetLegislators(outputDir);
      const leg = getWrittenContent(outputDir);
      assert.strictEqual(leg.bioguideId, "A000001");
      assert.strictEqual(leg.id?.twitter, "alexanderson");
      assert.strictEqual(leg.id?.facebook, "alexanderson");
    });

    test("should reduce legislators when small flag is true", async () => {
      const outputDir = "/test";
      await callGetLegislators(outputDir, false, true);
      const leg = getWrittenContent(outputDir);
      assert.strictEqual(leg.id, "A000001");
      assert.strictEqual(leg.bioguide, "A000001");
      assert.ok(leg.nameTitle);
      assert.strictEqual(leg.terms, undefined);
    });

    test("should handle error when file write fails", async () => {
      const wrappedFs = wrapFsWithThrow(fs);
      wrappedFs.setShouldThrowError(true, "Permission denied");
      await assert.rejects(
        () => callGetLegislators("/readonly", false, false, wrappedFs),
        { message: /Permission denied/ },
        "Should throw error when file write fails"
      );
    });

    test("should handle error when Legislators.getAllLegislators fails", async () => {
      MockLegislators.setShouldThrowError(true, "Failed to fetch legislators");
      await assert.rejects(
        () => callGetLegislators("/test"),
        { message: /Failed to fetch legislators/ },
        "Should throw error when getAllLegislators fails"
      );
    });

    test("should pass lastNCongresses option and log it", async () => {
      const outputDir = "/test";
      await getLegislators(
        outputDir,
        false,
        false,
        { lastNCongresses: 3 },
        fs,
        MockLegislators as any,
      );
      assert.ok(fs.existsSync(`${outputDir}/A000001.json`), "File should be written");
    });

    test("should write current members when currentMember is true", async () => {
      const outputDir = "/test";
      await callGetLegislators(outputDir, true);
      assert.ok(fs.existsSync(`${outputDir}/A000001.json`));
    });
  });

  describe("buildLegislatorsFromCache", () => {
    test("should return 0 when cache file does not exist", () => {
      const count = buildLegislatorsFromCache({
        cachePath: "/nonexistent/all-legislators.json",
        outputDir: "/test",
        fsModule: fs,
      });
      assert.strictEqual(count, 0);
    });

    test("should return 0 for invalid JSON in cache file", () => {
      mock({ "/cache/all-legislators.json": "not valid json{{{" });
      const count = buildLegislatorsFromCache({
        cachePath: "/cache/all-legislators.json",
        outputDir: "/test",
        fsModule: fs,
      });
      assert.strictEqual(count, 0);
    });

    test("should return 0 when cache file is not an array", () => {
      mock({ "/cache/all-legislators.json": JSON.stringify({ notAnArray: true }) });
      const count = buildLegislatorsFromCache({
        cachePath: "/cache/all-legislators.json",
        outputDir: "/test",
        fsModule: fs,
      });
      assert.strictEqual(count, 0);
    });

    test("should write full legislator files from cache", () => {
      const data: Legislator[] = mockLegislatorsOutput;
      mock({ "/cache/all-legislators.json": JSON.stringify(data) });

      const count = buildLegislatorsFromCache({
        cachePath: "/cache/all-legislators.json",
        outputDir: "/output",
        fsModule: fs,
      });

      assert.strictEqual(count, 1);
      assert.ok(fs.existsSync("/output/A000001.json"));
      const written = JSON.parse(fs.readFileSync("/output/A000001.json", "utf-8"));
      assert.strictEqual(written.bioguideId, "A000001");
    });

    test("should write reduced (small) legislator files from cache", () => {
      const data: Legislator[] = mockLegislatorsOutput;
      mock({ "/cache/all-legislators.json": JSON.stringify(data) });

      const count = buildLegislatorsFromCache({
        cachePath: "/cache/all-legislators.json",
        outputDir: "/output",
        small: true,
        fsModule: fs,
      });

      assert.strictEqual(count, 1);
      const written = JSON.parse(fs.readFileSync("/output/A000001.json", "utf-8"));
      assert.strictEqual(written.id, "A000001");
      assert.strictEqual(written.bioguide, "A000001");
      assert.strictEqual(written.terms, undefined);
    });

    test("should create output directory if it does not exist", () => {
      const data: Legislator[] = mockLegislatorsOutput;
      mock({ "/cache/all-legislators.json": JSON.stringify(data) });

      buildLegislatorsFromCache({
        cachePath: "/cache/all-legislators.json",
        outputDir: "/deep/nested/output",
        fsModule: fs,
      });

      assert.ok(fs.existsSync("/deep/nested/output"));
    });

    test("should skip entries without a bioguide ID", () => {
      const data = [{ bioguideId: undefined, name: { official_full: "No ID" } }];
      mock({ "/cache/all-legislators.json": JSON.stringify(data) });

      const count = buildLegislatorsFromCache({
        cachePath: "/cache/all-legislators.json",
        outputDir: "/output",
        fsModule: fs,
      });

      assert.strictEqual(count, 0);
    });
  });
});

