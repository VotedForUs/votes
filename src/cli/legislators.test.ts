import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";
import mock from "mock-fs";
import fs from "node:fs";
import {
  getLegislators,
  reduceLegislator,
  buildLegislatorsFromCache,
  downloadLegislatorImage,
  legislatorJsonWithoutUpdateDates,
} from "./legislators.js";
import { wrapFsWithThrow } from "../utils/mocks/wrap-fs-with-throw.js";
import { MockLegislators, mockLegislatorsOutput } from "../legislators/mocks/mock-legislators.js";
import type { Legislator } from "../legislators/legislators.types.js";

/**
 * Creates a mock HTTP get function for testing downloadLegislatorImage.
 * The returned mock supports: success, HTTP error, redirect, and network error.
 */
function createMockHttpGet(behavior: {
  statusCode?: number;
  redirectTo?: string;
  networkError?: string;
} = {}) {
  return (_url: string, callback: (res: any) => void) => {
    const req = new EventEmitter();
    process.nextTick(() => {
      if (behavior.networkError) {
        req.emit('error', new Error(behavior.networkError));
        return;
      }
      const res = new EventEmitter() as any;
      res.statusCode = behavior.statusCode ?? 200;
      res.headers = behavior.redirectTo ? { location: behavior.redirectTo } : {};
      res.pipe = (fileStream: any) => {
        process.nextTick(() => fileStream.end());
      };
      callback(res);
    });
    return req;
  };
}

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
    small: boolean = false,
    fsModule: typeof fs = fs,
  ) => {
    return getLegislators(
      outputDir,
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

  describe("legislatorJsonWithoutUpdateDates", () => {
    test("removes updateDate and recurses", () => {
      const input = {
        bioguideId: "A000001",
        updateDate: "2025-01-01",
        nested: { updateDate: "x", keep: 1 },
      };
      const out = legislatorJsonWithoutUpdateDates(input) as Record<string, unknown>;
      assert.ok(!('updateDate' in out));
      const nested = out.nested as Record<string, unknown>;
      assert.ok(!('updateDate' in nested));
      assert.strictEqual(nested.keep, 1);
    });
  });

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
      await callGetLegislators(outputDir, true);
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
        () => callGetLegislators("/readonly", false, wrappedFs),
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

    test("should pass congress option", async () => {
      const outputDir = "/test";
      await getLegislators(
        outputDir,
        false,
        { congress: 118 },
        fs,
        MockLegislators as any,
      );
      assert.ok(fs.existsSync(`${outputDir}/A000001.json`), "File should be written");
    });

    test("should skip image download when legislator has no imageUrl", async () => {
      const outputDir = "/test";
      const imagesDir = "/images";
      MockLegislators.setMockLegislators([
        { ...mockLegislatorsOutput[0], depiction: undefined },
      ] as any);
      const mockGet = createMockHttpGet({ statusCode: 200 });
      await getLegislators(outputDir, false, { imagesDir }, fs, MockLegislators as any, mockGet, mockGet);
      assert.ok(fs.existsSync(`${outputDir}/A000001.json`));
      assert.ok(!fs.existsSync(`${imagesDir}/A000001.jpg`), "No image should be downloaded");
    });

    test("should create imagesDir if it does not exist", async () => {
      const outputDir = "/test";
      const imagesDir = "/images/legislators";
      const mockGet = createMockHttpGet({ statusCode: 200 });
      MockLegislators.setMockLegislators([
        { ...mockLegislatorsOutput[0], depiction: { imageUrl: "https://example.com/A000001.jpg" } },
      ] as any);
      await getLegislators(outputDir, false, { imagesDir }, fs, MockLegislators as any, mockGet, mockGet);
      assert.ok(fs.existsSync(imagesDir), "imagesDir should be created");
    });

    test("should update imageUrl to local path when image file is already cached on disk", async () => {
      const outputDir = "/test";
      const imagesDir = "/images";
      mock({
        "/images/A000001.jpg": "image data",
      });
      const mockGet = createMockHttpGet({ statusCode: 404 });
      MockLegislators.setMockLegislators([
        { ...mockLegislatorsOutput[0], depiction: { imageUrl: "https://example.com/A000001.jpg" } },
      ] as any);
      await getLegislators(outputDir, false, { imagesDir }, fs, MockLegislators as any, mockGet, mockGet);
      const written = JSON.parse(fs.readFileSync(`${outputDir}/A000001.json`, "utf-8"));
      assert.strictEqual(written.depiction.imageUrl, "/images/legislators/A000001.jpg", "imageUrl should point to local path when file already exists");
    });

    test("should update imageUrl to local path after download", async () => {
      const outputDir = "/test";
      const imagesDir = "/images";
      const mockGet = createMockHttpGet({ statusCode: 200 });
      MockLegislators.setMockLegislators([
        { ...mockLegislatorsOutput[0], depiction: { imageUrl: "https://example.com/A000001.jpg" } },
      ] as any);
      await getLegislators(outputDir, false, { imagesDir }, fs, MockLegislators as any, mockGet, mockGet);
      const written = JSON.parse(fs.readFileSync(`${outputDir}/A000001.json`, "utf-8"));
      assert.strictEqual(written.depiction.imageUrl, "/images/legislators/A000001.jpg");
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

    test("skips write when only updateDate differs", () => {
      const baseLeg = { ...mockLegislatorsOutput[0], updateDate: "2025-01-01" };
      mock({
        "/cache/all-legislators.json": JSON.stringify([{ ...baseLeg, updateDate: "2099-12-31" }]),
        "/output/A000001.json": JSON.stringify(baseLeg, null, 2),
      });
      const mtimeBefore = fs.statSync("/output/A000001.json").mtimeMs;
      const count = buildLegislatorsFromCache({
        cachePath: "/cache/all-legislators.json",
        outputDir: "/output",
        fsModule: fs,
      });
      assert.strictEqual(count, 1);
      const mtimeAfter = fs.statSync("/output/A000001.json").mtimeMs;
      assert.strictEqual(mtimeBefore, mtimeAfter);
    });
  });
});

describe("downloadLegislatorImage", () => {
  afterEach(() => {
    mock.restore();
    MockLegislators.reset();
  });

  test("returns local path when file already exists", async () => {
    mock({ "/images/A000001.jpg": "image data" });
    const result = await downloadLegislatorImage(
      "https://example.com/A000001.jpg",
      "A000001",
      "/images",
      fs,
    );
    assert.strictEqual(result, "/images/legislators/A000001.jpg");
  });

  test("returns local path after successful HTTPS download", async () => {
    mock({ "/images": {} });
    const mockGet = createMockHttpGet({ statusCode: 200 });
    const result = await downloadLegislatorImage(
      "https://example.com/A000001.jpg",
      "A000001",
      "/images",
      fs,
      mockGet,
    );
    assert.strictEqual(result, "/images/legislators/A000001.jpg");
  });

  test("returns original URL on HTTP error status", async () => {
    mock({});
    const mockGet = createMockHttpGet({ statusCode: 404 });
    const result = await downloadLegislatorImage(
      "https://example.com/A000001.jpg",
      "A000001",
      "/images",
      fs,
      mockGet,
    );
    assert.strictEqual(result, "https://example.com/A000001.jpg");
  });

  test("returns original URL on missing status code", async () => {
    mock({});
    const mockGet = createMockHttpGet({ statusCode: undefined });
    const result = await downloadLegislatorImage(
      "https://example.com/A000001.jpg",
      "A000001",
      "/images",
      fs,
      mockGet,
    );
    assert.strictEqual(result, "https://example.com/A000001.jpg");
  });

  test("follows redirect with location header", async () => {
    mock({ "/images": {} });
    const redirectTarget = "https://example.com/redirected/A000001.jpg";
    let callCount = 0;
    const mockGet = (url: string, callback: (res: any) => void) => {
      const req = new EventEmitter();
      process.nextTick(() => {
        const res = new EventEmitter() as any;
        if (callCount === 0) {
          res.statusCode = 301;
          res.headers = { location: redirectTarget };
          res.pipe = () => {};
        } else {
          res.statusCode = 200;
          res.headers = {};
          res.pipe = (fileStream: any) => {
            process.nextTick(() => fileStream.end());
          };
        }
        callCount++;
        callback(res);
      });
      return req;
    };
    const result = await downloadLegislatorImage(
      "https://example.com/A000001.jpg",
      "A000001",
      "/images",
      fs,
      mockGet as any,
    );
    assert.strictEqual(result, "/images/legislators/A000001.jpg");
  });

  test("returns original URL on redirect without location", async () => {
    mock({});
    const mockGet = createMockHttpGet({ statusCode: 301 });
    const result = await downloadLegislatorImage(
      "https://example.com/A000001.jpg",
      "A000001",
      "/images",
      fs,
      mockGet,
    );
    assert.strictEqual(result, "https://example.com/A000001.jpg");
  });

  test("returns original URL on network error", async () => {
    mock({});
    const mockGet = createMockHttpGet({ networkError: "ECONNREFUSED" });
    const result = await downloadLegislatorImage(
      "https://example.com/A000001.jpg",
      "A000001",
      "/images",
      fs,
      mockGet,
    );
    assert.strictEqual(result, "https://example.com/A000001.jpg");
  });

  test("uses http module for http:// URLs", async () => {
    mock({ "/images": {} });
    const mockHttpsGet = createMockHttpGet({ statusCode: 404 });
    const mockHttpGet = createMockHttpGet({ statusCode: 200 });
    const result = await downloadLegislatorImage(
      "http://example.com/A000001.jpg",
      "A000001",
      "/images",
      fs,
      mockHttpsGet,
      mockHttpGet,
    );
    assert.strictEqual(result, "/images/legislators/A000001.jpg");
  });

  test("uses image extension from URL pathname", async () => {
    mock({ "/images": {} });
    const mockGet = createMockHttpGet({ statusCode: 200 });
    const result = await downloadLegislatorImage(
      "https://example.com/photos/A000001.png",
      "A000001",
      "/images",
      fs,
      mockGet,
    );
    assert.strictEqual(result, "/images/legislators/A000001.png");
  });

  test("defaults to .jpg when URL has no extension", async () => {
    mock({ "/images": {} });
    const mockGet = createMockHttpGet({ statusCode: 200 });
    const result = await downloadLegislatorImage(
      "https://example.com/photos/A000001",
      "A000001",
      "/images",
      fs,
      mockGet,
    );
    assert.strictEqual(result, "/images/legislators/A000001.jpg");
  });
});

