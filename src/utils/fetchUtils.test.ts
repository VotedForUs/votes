import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import mock from "mock-fs";
import fs from "node:fs";
import fetchMock from "fetch-mock";
import { wrapFsWithThrow } from "./mocks/wrap-fs-with-throw.js";
import {
  makeHttpRequest,
  makeApiCall,
  makeCachedApiCall,
  isFetchError,
  getErrorMessage,
  FetchError,
  CachedApiCallConfig,
} from "./fetchUtils.js";

describe("fetchUtils", () => {
  beforeEach(() => {
    fetchMock.hardReset();
    mock({});
  });

  afterEach(() => {
    fetchMock.hardReset();
    mock.restore();
  });

  describe("makeHttpRequest", () => {
    test("should make successful HTTP request", async () => {
      const testData = { message: "success", data: [1, 2, 3] };
      fetchMock.get("https://example.com/api", testData);

      const result = await makeHttpRequest<typeof testData>(
        "https://example.com/api",
        {},
        fetchMock.fetchHandler as typeof fetch,
      );

      assert.deepStrictEqual(result, testData);
    });

    test("should handle 401 authentication errors", async () => {
      fetchMock.get("https://example.com/api", { status: 401, body: { error: "Authentication failed" } });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "Authentication failed. Please check your API key.",
        },
      );
    });

    test("should handle 403 forbidden errors", async () => {
      fetchMock.get("https://example.com/api", { status: 403, body: { error: "Access denied" } });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "Access forbidden. Please check your API key permissions.",
        },
      );
    });

    test("should handle 404 not found errors", async () => {
      fetchMock.get("https://example.com/api", { status: 404, body: { error: "Resource not found" } });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "Resource not found. Please check the endpoint and parameters.",
        },
      );
    });

    test("should handle 429 rate limit errors", async () => {
      fetchMock.get("https://example.com/api", { status: 429, body: { error: "Rate limit exceeded" } });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "Rate limit exceeded. Please wait before making more requests.",
        },
      );
    });

    test("should handle 500 server errors", async () => {
      fetchMock.get("https://example.com/api", { status: 500, body: { error: "Server error" } });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "Internal server error. Please try again later.",
        },
      );
    });

    test("should handle 502 bad gateway errors", async () => {
      fetchMock.get("https://example.com/api", { status: 502, body: { error: "Bad gateway" } });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "Bad gateway. The server is temporarily unavailable.",
        },
      );
    });

    test("should handle 503 service unavailable errors", async () => {
      fetchMock.get("https://example.com/api", { status: 503, body: { error: "Service unavailable" } });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "Service unavailable. Please try again later.",
        },
      );
    });

    test("should handle generic HTTP errors", async () => {
      fetchMock.get("https://example.com/api", { status: 418, body: { error: "Teapot error" } });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "HTTP 418: I'm a teapot",
        },
      );
    });

    test("should handle network errors", async () => {
      fetchMock.catch({ throws: new Error("Network connection failed") });

      await assert.rejects(
        () =>
          makeHttpRequest(
            "https://example.com/api",
            {},
            fetchMock.fetchHandler as typeof fetch,
          ),
        {
          message: "Network error: Network connection failed",
        },
      );
    });

    test("should include status information in FetchError", async () => {
      fetchMock.get("https://example.com/api", 404);

      try {
        await makeHttpRequest(
          "https://example.com/api",
          {},
          fetchMock.fetchHandler as typeof fetch,
        );
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(isFetchError(error));
        assert.strictEqual(error.status, 404);
        assert.strictEqual(error.statusText, "Not Found");
      }
    });
  });


  describe("makeApiCall", () => {
    test("should make successful API call with default headers", async () => {
      const testData = { api: "success" };
      fetchMock.get("https://api.example.com/data", testData);

      const result = await makeApiCall<typeof testData>(
        "https://api.example.com/data",
        {},
        fetchMock.fetchHandler as typeof fetch,
      );

      assert.deepStrictEqual(result, testData);
    });

    test("should merge custom headers with defaults", async () => {
      const testData = { custom: "headers" };
      fetchMock.get("https://api.example.com/data", testData);

      const result = await makeApiCall<typeof testData>(
        "https://api.example.com/data",
        {
          headers: {
            "Authorization": "Bearer token",
            "X-Custom": "value",
          },
        },
        fetchMock.fetchHandler as typeof fetch,
      );

      assert.deepStrictEqual(result, testData);
    });

    test("should handle POST requests with body", async () => {
      const testData = { created: true };
      fetchMock.post("https://api.example.com/create", testData);

      const result = await makeApiCall<typeof testData>(
        "https://api.example.com/create",
        {
          method: "POST",
          body: JSON.stringify({ name: "test" }),
        },
        fetchMock.fetchHandler as typeof fetch,
      );

      assert.deepStrictEqual(result, testData);
    });
  });

  describe("isFetchError", () => {
    test("should identify FetchError instances", () => {
      const fetchError = new Error("Test error") as FetchError;
      fetchError.status = 404;
      fetchError.statusText = "Not Found";

      assert.strictEqual(isFetchError(fetchError), true);
    });

    test("should reject regular Error instances", () => {
      const regularError = new Error("Regular error");
      assert.strictEqual(isFetchError(regularError), false);
    });

    test("should reject non-Error objects", () => {
      const notAnError = { message: "Not an error" };
      assert.strictEqual(isFetchError(notAnError), false);
    });

    test("should reject null and undefined", () => {
      assert.strictEqual(isFetchError(null), false);
      assert.strictEqual(isFetchError(undefined), false);
    });
  });

  describe("getErrorMessage", () => {
    test("should extract message from FetchError", () => {
      const fetchError = new Error("Fetch error message") as FetchError;
      fetchError.status = 500;
      
      const message = getErrorMessage(fetchError);
      assert.strictEqual(message, "Fetch error message");
    });

    test("should extract message from regular Error", () => {
      const error = new Error("Regular error message");
      
      const message = getErrorMessage(error);
      assert.strictEqual(message, "Regular error message");
    });

    test("should convert string to message", () => {
      const message = getErrorMessage("String error");
      assert.strictEqual(message, "String error");
    });

    test("should convert number to message", () => {
      const message = getErrorMessage(404);
      assert.strictEqual(message, "404");
    });

    test("should handle null and undefined", () => {
      assert.strictEqual(getErrorMessage(null), "null");
      assert.strictEqual(getErrorMessage(undefined), "undefined");
    });

    test("should handle objects", () => {
      const obj = { error: "Object error" };
      const message = getErrorMessage(obj);
      assert.strictEqual(message, "[object Object]");
    });
  });

  describe("error propagation", () => {
    test("should preserve FetchError properties through makeHttpRequest", async () => {
      fetchMock.get("https://example.com/api", { status: 429 });

      try {
        await makeHttpRequest(
          "https://example.com/api",
          {},
          fetchMock.fetchHandler as typeof fetch,
        );
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(isFetchError(error));
        assert.strictEqual(error.status, 429);
        assert.strictEqual(error.statusText, "Too Many Requests");
        assert.ok(error.response);
      }
    });


    test("should preserve FetchError properties through makeApiCall", async () => {
      fetchMock.get("https://example.com/api", { status: 403 });

      try {
        await makeApiCall(
          "https://example.com/api",
          {},
          fetchMock.fetchHandler as typeof fetch,
        );
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(isFetchError(error));
        assert.strictEqual(error.status, 403);
        assert.strictEqual(error.statusText, "Forbidden");
      }
    });
  });

  describe("edge cases", () => {
    test("should handle empty response body", async () => {
      // Mock a response that returns empty string
      const mockFetch = async () => {
        return new Response("", {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        });
      };

      await assert.rejects(
        () => makeHttpRequest("https://example.com/empty", {}, mockFetch),
        /Network error: Unexpected end of JSON input/,
      );
    });

    test("should handle malformed JSON response", async () => {
      // Mock a response that returns invalid JSON
      const mockFetch = async () => {
        return new Response("invalid json {", {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        });
      };

      await assert.rejects(
        () => makeHttpRequest("https://example.com/invalid", {}, mockFetch),
        /Network error: Unexpected token/,
      );
    });

    test("should handle very long URLs", async () => {
      const longUrl = "https://api.example.com/very/long/endpoint/with/many/segments/and/parameters?param1=value1&param2=value2";
      const testData = { success: true };
      
      fetchMock.get(longUrl, testData);

      const result = await makeApiCall<typeof testData>(
        longUrl,
        {},
        fetchMock.fetchHandler as typeof fetch,
      );

      assert.deepStrictEqual(result, testData);
    });
  });

  describe("makeCachedApiCall", () => {
    const testConfig: CachedApiCallConfig = {
      baseUrl: "https://api.congress.gov/v3",
      apiKey: "test-key",
      cacheDir: "/test/cache",
      format: "json",
      skipCache: false,
    };

    test("should make successful cached API call", async () => {
      const testData = { bills: [], pagination: { count: 0 } };
      const expectedUrl = "https://api.congress.gov/v3/bill/119/hr?api_key=test-key&format=json";
      fetchMock.get(expectedUrl, testData);

      const result = await makeCachedApiCall<typeof testData>(
        "/bill/119/hr",
        testConfig,
        undefined,
        fetchMock.fetchHandler as typeof fetch,
        fs,
      );

      assert.deepStrictEqual(result, testData);
      // Verify cache was written (now uses directory structure)
      assert.ok(fs.existsSync("/test/cache/bill/119/hr.json"));
    });

    test("should return cached data when cache is valid", async () => {
      const cachedData = { bills: [{ id: "cached" }], pagination: { count: 1 } };
      // Set up cache with new directory structure
      fs.mkdirSync("/test/cache/bill/119", { recursive: true });
      fs.writeFileSync("/test/cache/bill/119/hr.json", JSON.stringify(cachedData));

      const result = await makeCachedApiCall<typeof cachedData>(
        "/bill/119/hr",
        testConfig,
        undefined,
        fetchMock.fetchHandler as typeof fetch,
        fs,
      );

      assert.deepStrictEqual(result, cachedData);
      // Should not have made a network request
      assert.strictEqual(fetchMock.callHistory.calls().length, 0);
    });

    test("should fetch from API when cache doesn't exist", async () => {
      const testData = { bills: [{ id: "fresh" }], pagination: { count: 1 } };
      const expectedUrl = "https://api.congress.gov/v3/bill/119/hr?api_key=test-key&format=json";
      fetchMock.get(expectedUrl, testData);

      const result = await makeCachedApiCall<typeof testData>(
        "/bill/119/hr",
        testConfig,
        undefined,
        fetchMock.fetchHandler as typeof fetch,
        fs,
      );

      assert.deepStrictEqual(result, testData);
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should throw error when API key is missing", async () => {
      const configWithoutKey = { ...testConfig, apiKey: "" };

      await assert.rejects(
        () => makeCachedApiCall("/test", configWithoutKey, undefined, fetchMock.fetchHandler as typeof fetch),
        {
          message: "API key is required for cached API calls.",
        },
      );
    });

    test("should handle cache read errors gracefully", async () => {
      const testData = { success: true };
      const expectedUrl = "https://api.congress.gov/v3/test?api_key=test-key&format=json";
      fetchMock.get(expectedUrl, testData);

      // Set up a cache file with invalid JSON
      fs.mkdirSync("/test/cache", { recursive: true });
      fs.writeFileSync("/test/cache/test.json", "invalid json {");

      const result = await makeCachedApiCall<typeof testData>(
        "/test",
        testConfig,
        undefined,
        fetchMock.fetchHandler as typeof fetch,
        fs,
      );

      // Should fall back to API call
      assert.deepStrictEqual(result, testData);
      assert.strictEqual(fetchMock.callHistory.calls().length, 1);
    });

    test("should handle cache write errors gracefully", async () => {
      const testData = { success: true };
      const expectedUrl = "https://api.congress.gov/v3/test?api_key=test-key&format=json";
      fetchMock.get(expectedUrl, testData);

      const wrappedFs = wrapFsWithThrow(fs);
      wrappedFs.setShouldThrowError(true, "Write permission denied");

      const result = await makeCachedApiCall<typeof testData>(
        "/test",
        testConfig,
        undefined,
        fetchMock.fetchHandler as typeof fetch,
        wrappedFs,
      );

      // Should still return the result even if caching fails
      assert.deepStrictEqual(result, testData);
    });

    test("should use custom format parameter", async () => {
      const testData = { xml: true };
      const customConfig = { ...testConfig, format: "xml" };
      const expectedUrl = "https://api.congress.gov/v3/test?api_key=test-key&format=xml";
      fetchMock.get(expectedUrl, testData);

      const result = await makeCachedApiCall<typeof testData>(
        "/test",
        customConfig,
        undefined,
        fetchMock.fetchHandler as typeof fetch,
        fs,
      );

      assert.deepStrictEqual(result, testData);
    });
  });

});
