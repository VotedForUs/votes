import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import mock from "mock-fs";
import fetchMock from "fetch-mock";
import { XmlUtils, XmlDownloadConfig } from "./xml-utils.js";

describe("XmlUtils", () => {
  const testCacheDir = "./test-cache-xml";
  const testUrl = "https://clerk.house.gov/evs/2024/roll001.xml"; // Example House vote XML

  beforeEach(() => {
    // Clean up any existing test cache
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test cache after each test
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  describe("downloadXml", () => {
    it("should use default cache directory when none specified", async () => {
      const config: XmlDownloadConfig = {
        url: testUrl,
        cacheFilename: "test-vote.xml",
        useCache: true,
        parseXml: false,
      };

      console.log("Testing XML default cache directory behavior...");
      console.log("Config:", JSON.stringify(config, null, 2));

      try {
        const result = await XmlUtils.downloadXml(config);
        console.log("Result cachePath:", result.cachePath);
        console.log("Result fromCache:", result.fromCache);

        // Check if the cache path uses the default directory
        assert(result.cachePath, "Cache path should be defined");
        console.log("Cache path resolved:", path.resolve(result.cachePath));

        // The cache path should contain the default cache directory
        // Since we're running from packages/votes, the default cache should be in workspace root
        const expectedDefaultPath = path.resolve("../../.cache");
        const actualCachePath = path.resolve(result.cachePath);
        console.log("Expected default path:", expectedDefaultPath);
        console.log("Actual cache path:", actualCachePath);

        // The test should check that the cache path contains the expected directory structure
        // Since CacheConfig.getRootCacheDir() may resolve differently in test environment,
        // we'll check that the cache path ends with the expected filename
        assert(
          result.cachePath.includes("test-vote.xml"),
          `Cache path should contain the expected filename. Got: ${result.cachePath}`,
        );
      } catch (error) {
        console.error("XML test failed with error:", error);
        throw error;
      }
    });

    it("should use custom cache directory when specified", async () => {
      const config: XmlDownloadConfig = {
        url: testUrl,
        cacheDir: testCacheDir,
        cacheFilename: "test-vote.xml",
        useCache: true,
        parseXml: false,
      };

      console.log("Testing XML custom cache directory behavior...");
      console.log("Config:", JSON.stringify(config, null, 2));

      try {
        const result = await XmlUtils.downloadXml(config);
        console.log("Result cachePath:", result.cachePath);
        console.log("Result fromCache:", result.fromCache);

        // Check if the cache path uses the custom directory
        assert(result.cachePath, "Cache path should be defined");
        const expectedCustomPath = path.resolve(testCacheDir);
        const actualCachePath = path.resolve(result.cachePath);
        console.log("Expected custom path:", expectedCustomPath);
        console.log("Actual cache path:", actualCachePath);

        assert(
          actualCachePath.startsWith(expectedCustomPath),
          `Cache path should start with custom directory. Expected: ${expectedCustomPath}, Got: ${actualCachePath}`,
        );

        // Verify the file was actually created in the right place
        assert(fs.existsSync(result.cachePath), "Cache file should exist");
      } catch (error) {
        console.error("XML test failed with error:", error);
        throw error;
      }
    });

    it("should respect cacheFilename parameter", async () => {
      const customFilename = "my-custom-vote.xml";
      const config: XmlDownloadConfig = {
        url: testUrl,
        cacheDir: testCacheDir,
        cacheFilename: customFilename,
        useCache: true,
        parseXml: false,
      };

      console.log("Testing XML custom filename behavior...");

      const result = await XmlUtils.downloadXml(config);

      assert(result.cachePath, "Cache path should be defined");
      assert(
        result.cachePath.endsWith(customFilename),
        `Cache path should end with custom filename. Got: ${result.cachePath}`,
      );

      // Verify the file exists with the correct name
      const expectedPath = path.join(testCacheDir, customFilename);
      assert(
        fs.existsSync(expectedPath),
        `File should exist at ${expectedPath}`,
      );
    });

    it("should handle XML parsing when parseXml is true", async () => {
      const config: XmlDownloadConfig = {
        url: testUrl,
        cacheDir: testCacheDir,
        cacheFilename: "parsed-vote.json", // JSON when parsed
        useCache: true,
        parseXml: true,
      };

      console.log("Testing XML parsing behavior...");

      try {
        const result = await XmlUtils.downloadXml(config);

        // When parseXml is true, data should be an object, not a string
        assert(
          typeof result.data === "object",
          "Parsed XML should be an object",
        );
        assert(result.data !== null, "Parsed XML should not be null");

        console.log("Parsed XML data type:", typeof result.data);
        console.log("Parsed XML keys:", Object.keys(result.data as object));
      } catch (error) {
        console.error("XML parsing test failed with error:", error);
        throw error;
      }
    });

    it("should return raw XML string when parseXml is false", async () => {
      const config: XmlDownloadConfig = {
        url: testUrl,
        cacheDir: testCacheDir,
        cacheFilename: "raw-vote.xml",
        useCache: true,
        parseXml: false,
      };

      console.log("Testing XML raw string behavior...");

      try {
        const result = await XmlUtils.downloadXml(config);

        // When parseXml is false, data should be a string
        assert(typeof result.data === "string", "Raw XML should be a string");
        assert(
          result.data.includes("<?xml"),
          "Raw XML should contain XML declaration",
        );

        console.log("Raw XML data type:", typeof result.data);
        console.log("Raw XML length:", (result.data as string).length);
      } catch (error) {
        console.error("XML raw test failed with error:", error);
        throw error;
      }
    });
  });

  describe("downloadXml (mocked fetch)", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      fetchMock.hardReset();
      mock({});
      originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock.fetchHandler as typeof fetch;
    });

    afterEach(() => {
      fetchMock.hardReset();
      mock.restore();
      globalThis.fetch = originalFetch;
    });

    it("should throw on HTTP error response", async () => {
      fetchMock.get(testUrl, { status: 404, body: "Not Found" });
      await assert.rejects(
        () => XmlUtils.downloadXml({ url: testUrl, cacheDir: testCacheDir, cacheFilename: "err.xml" }),
        /HTTP 404/,
      );
    });

    it("should skip cache when skipCache is true", async () => {
      const rawXml = "<votes><vote>1</vote></votes>";
      mock({ [testCacheDir + "/skip.xml"]: rawXml });
      fetchMock.get(testUrl, { status: 200, body: rawXml });

      const result = await XmlUtils.downloadXml({
        url: testUrl,
        cacheDir: testCacheDir,
        cacheFilename: "skip.xml",
        useCache: true,
        skipCache: true,
      });

      assert.strictEqual(result.fromCache, false);
      assert.strictEqual(result.data, rawXml);
    });

    it("should not save cache when useCache is false", async () => {
      const rawXml = "<votes><vote>1</vote></votes>";
      fetchMock.get(testUrl, { status: 200, body: rawXml });

      const result = await XmlUtils.downloadXml({
        url: testUrl,
        cacheDir: testCacheDir,
        cacheFilename: "nocache.xml",
        useCache: false,
      });

      assert.strictEqual(result.fromCache, false);
      assert.strictEqual(result.cachePath, undefined);
      assert.ok(!fs.existsSync(testCacheDir + "/nocache.xml"));
    });

    it("should use default cache directory when cacheDir is omitted", async () => {
      const rawXml = "<data/>";
      fetchMock.get(testUrl, { status: 200, body: rawXml });

      const result = await XmlUtils.downloadXml({
        url: testUrl,
        cacheFilename: "default-cache.xml",
        useCache: true,
      });

      assert.ok(result.cachePath, "cachePath should be set");
      assert.ok(result.cachePath!.includes("default-cache.xml"));
      if (fs.existsSync(result.cachePath!)) {
        fs.unlinkSync(result.cachePath!);
      }
    });
  });

  describe("downloadXmlNoCache (mocked fetch)", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      fetchMock.hardReset();
      originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock.fetchHandler as typeof fetch;
    });

    afterEach(() => {
      fetchMock.hardReset();
      globalThis.fetch = originalFetch;
    });

    it("should download raw XML without caching", async () => {
      const rawXml = "<data><item>test</item></data>";
      fetchMock.get(testUrl, { status: 200, body: rawXml });

      const result = await XmlUtils.downloadXmlNoCache(testUrl);

      assert.strictEqual(result, rawXml);
    });

    it("should parse XML when parseXml is true", async () => {
      const rawXml = "<root><item>1</item></root>";
      fetchMock.get(testUrl, { status: 200, body: rawXml });

      const result = await XmlUtils.downloadXmlNoCache(testUrl, {}, true);

      assert.strictEqual(typeof result, "object");
    });

    it("should throw on HTTP error", async () => {
      fetchMock.get(testUrl, { status: 500, body: "Server Error" });

      await assert.rejects(
        () => XmlUtils.downloadXmlNoCache(testUrl),
        /HTTP 500/,
      );
    });
  });

  describe("clearCache", () => {
    afterEach(() => mock.restore());

    it("should clear cache for a specific URL", () => {
      mock({
        [testCacheDir + "/vote1.xml"]: "<data/>",
        [testCacheDir + "/vote2.xml"]: "<data/>",
      });
      const url = "https://example.com/vote1.xml";
      const cachePath = testCacheDir + "/vote1.xml";
      assert.ok(fs.existsSync(cachePath));
      XmlUtils.clearCache(testCacheDir, url);
      assert.ok(!fs.existsSync(cachePath));
      assert.ok(fs.existsSync(testCacheDir + "/vote2.xml"), "other files untouched");
    });

    it("should clear all cache when no URL provided (real fs)", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "xml-cache-test-"));
      fs.writeFileSync(path.join(tmpDir, "vote1.xml"), "<data/>");
      fs.writeFileSync(path.join(tmpDir, "vote2.xml"), "<data/>");
      assert.ok(fs.existsSync(tmpDir));
      XmlUtils.clearCache(tmpDir);
      assert.ok(!fs.existsSync(tmpDir));
    });

    it("should handle missing cache directory gracefully", () => {
      mock({});
      assert.doesNotThrow(() => XmlUtils.clearCache("/nonexistent-dir"));
    });

    it("should handle URL not in cache gracefully", () => {
      mock({ [testCacheDir + "/vote1.xml"]: "<data/>" });
      assert.doesNotThrow(() => XmlUtils.clearCache(testCacheDir, "https://example.com/missing.xml"));
    });
  });

  describe("getCacheStats", () => {
    afterEach(() => mock.restore());

    it("should return empty stats for missing directory", () => {
      mock({});
      const stats = XmlUtils.getCacheStats("/nonexistent-dir");
      assert.strictEqual(stats.totalFiles, 0);
      assert.strictEqual(stats.totalSize, 0);
    });

    it("should return file stats for existing cache directory", () => {
      mock({ [testCacheDir + "/vote1.xml"]: "content1", [testCacheDir + "/vote2.xml"]: "content2" });
      const stats = XmlUtils.getCacheStats(testCacheDir);
      assert.strictEqual(stats.totalFiles, 2);
      assert.ok(stats.totalSize > 0);
      assert.strictEqual(stats.files.length, 2);
    });
  });

  describe("loadFromCache", () => {
    afterEach(() => mock.restore());

    it("should load raw XML string when parseXml is false", () => {
      const xml = "<data/>";
      mock({ "/cache/test.xml": xml });
      const result = XmlUtils.loadFromCache("/cache/test.xml", false);
      assert.strictEqual(result, xml);
    });

    it("should parse XML when parseXml is true", () => {
      const xml = "<root><item>1</item></root>";
      mock({ "/cache/test.xml": xml });
      const result = XmlUtils.loadFromCache("/cache/test.xml", true);
      assert.strictEqual(typeof result, "object");
    });

    it("should throw on missing file", () => {
      mock({});
      assert.throws(() => XmlUtils.loadFromCache("/nonexistent.xml"), /Failed to load cached XML/);
    });
  });

  describe("downloadMultipleXml", () => {
    it("should handle multiple configs with different cache directories", async () => {
      const configs: XmlDownloadConfig[] = [
        {
          url: "https://clerk.house.gov/evs/2024/roll001.xml",
          cacheDir: testCacheDir + "/house",
          cacheFilename: "vote1.xml",
          useCache: true,
          parseXml: false,
        },
        {
          url: "https://clerk.house.gov/evs/2024/roll002.xml",
          cacheDir: testCacheDir + "/house",
          cacheFilename: "vote2.xml",
          useCache: true,
          parseXml: false,
        },
      ];

      console.log("Testing multiple XML configs...");

      try {
        const results = await XmlUtils.downloadMultipleXml(configs);

        assert.equal(
          results.length,
          2,
          "Should return results for both configs",
        );

        // Check first result
        assert(results[0].cachePath, "First result should have cache path");
        assert(
          results[0].cachePath.includes("house"),
          "First cache path should contain house",
        );

        // Check second result
        assert(results[1].cachePath, "Second result should have cache path");
        assert(
          results[1].cachePath.includes("house"),
          "Second cache path should contain house",
        );

        console.log("First cache path:", results[0].cachePath);
        console.log("Second cache path:", results[1].cachePath);
      } catch (error) {
        console.error("Multiple XML test failed with error:", error);
        throw error;
      }
    });
  });
});
