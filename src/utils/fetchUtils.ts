/**
 * Generic utility functions for making HTTP requests with error handling
 * Provides centralized fetch functionality for any API with caching support
 */

import * as fs from "fs";
import * as path from "path";

export interface FetchConfig {
  timeout?: number;
}

export interface CachedApiCallConfig {
  baseUrl: string;
  apiKey: string;
  cacheDir: string;
  format?: string;
  skipCache?: boolean;
  /** When true, bypasses cache read but still writes to cache (useful for incremental updates) */
  forceRefresh?: boolean;
}

export interface FetchError extends Error {
  status?: number;
  statusText?: string;
  response?: Response;
}

/**
 * Creates a custom error with HTTP status information
 */
function createFetchError(
  message: string,
  status?: number,
  statusText?: string,
  response?: Response,
): FetchError {
  const error = new Error(message) as FetchError;
  error.status = status;
  error.statusText = statusText;
  error.response = response;
  return error;
}

/**
 * Makes an HTTP request with comprehensive error handling
 * @param url - The URL to fetch
 * @param options - Fetch options (headers, method, etc.)
 * @param fetchFunction - Optional custom fetch function (for testing)
 * @returns Promise resolving to the parsed JSON response
 */
export async function makeHttpRequest<T>(
  url: string,
  options: RequestInit = {},
  fetchFunction: typeof fetch = fetch,
): Promise<T> {
  try {
    const response = await fetchFunction(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HTTP Error:", response.status, response.statusText);
      console.error("Response data:", errorText);

      // Handle specific HTTP status codes
      switch (response.status) {
        case 401:
          throw createFetchError(
            "Authentication failed. Please check your API key.",
            response.status,
            response.statusText,
            response,
          );
        case 403:
          throw createFetchError(
            "Access forbidden. Please check your API key permissions.",
            response.status,
            response.statusText,
            response,
          );
        case 404:
          throw createFetchError(
            "Resource not found. Please check the endpoint and parameters.",
            response.status,
            response.statusText,
            response,
          );
        case 429:
          throw createFetchError(
            "Rate limit exceeded. Please wait before making more requests.",
            response.status,
            response.statusText,
            response,
          );
        case 500:
          throw createFetchError(
            "Internal server error. Please try again later.",
            response.status,
            response.statusText,
            response,
          );
        case 502:
          throw createFetchError(
            "Bad gateway. The server is temporarily unavailable.",
            response.status,
            response.statusText,
            response,
          );
        case 503:
          throw createFetchError(
            "Service unavailable. Please try again later.",
            response.status,
            response.statusText,
            response,
          );
        default:
          throw createFetchError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            response.statusText,
            response,
          );
      }
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      // Re-throw FetchError instances
      throw error;
    }
    
    // Handle network errors and other exceptions
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw createFetchError(`Network error: ${errorMessage}`);
  }
}


/**
 * Makes a generic API call with custom headers and options
 * @param url - The full URL to fetch
 * @param options - Fetch options including headers, method, body, etc.
 * @param fetchFunction - Optional custom fetch function (for testing)
 * @returns Promise resolving to the parsed JSON response
 */
export async function makeApiCall<T>(
  url: string,
  options: RequestInit = {},
  fetchFunction: typeof fetch = fetch,
): Promise<T> {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const mergedOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  return makeHttpRequest<T>(url, mergedOptions, fetchFunction);
}

/**
 * Utility function to check if an error is a FetchError
 * @param error - The error to check
 * @returns True if the error is a FetchError with status information
 */
export function isFetchError(error: unknown): error is FetchError {
  return error instanceof Error && 'status' in error;
}

/**
 * Utility function to get error message from various error types
 * @param error - The error to extract message from
 * @returns A user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isFetchError(error)) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}

/**
 * Checks if cached data exists
 * Cache files are treated as permanent storage and never expire based on age
 * @param cacheFilePath - Path to the cache file
 * @param fsModule - File system module to use
 * @returns True if cache exists, false otherwise
 */
function cacheExists(
  cacheFilePath: string,
  fsModule: typeof fs,
): boolean {
  try {
    return fsModule.existsSync(cacheFilePath);
  } catch (error) {
    console.warn(`Error checking cache existence for ${cacheFilePath}:`, error);
    return false;
  }
}

/**
 * Reads and parses a cache file if it exists
 * @param cacheFilePath - Full path to the cache file
 * @param fsModule - Optional custom fs module (for testing)
 * @returns Parsed cache data or null if file doesn't exist or is invalid
 */
export function readCacheFile<T>(
  cacheFilePath: string,
  fsModule: typeof fs = fs,
): T | null {
  try {
    if (!fsModule.existsSync(cacheFilePath)) {
      return null;
    }
    const cachedData = fsModule.readFileSync(cacheFilePath, "utf8");
    return JSON.parse(cachedData) as T;
  } catch (error) {
    console.warn(`Error reading cache file ${cacheFilePath}:`, error);
    return null;
  }
}

/**
 * Generates a cache file path for an API endpoint with optional query parameters
 * Maintains the endpoint structure to mirror the API path
 * Query parameters are encoded into the filename to prevent collisions
 * @param cacheDir - Base cache directory
 * @param endpoint - API endpoint (e.g., "/member/A000001" or "/bill/119/hr/1")
 * @param params - Optional query parameters to include in cache path
 * @returns Cache file path (e.g., "cacheDir/member/A000001.json" or "cacheDir/member_currentMember-true.json")
 */
export function getCacheFilePath(cacheDir: string, endpoint: string, params?: Record<string, any>): string {
  // Remove leading slash and sanitize any remaining special characters (except slashes)
  let cleanEndpoint = endpoint
    .replace(/^\//, '') // Remove leading slash
    .replace(/[^a-zA-Z0-9/_-]/g, '_'); // Replace special chars (except slashes) with underscores
  
  // Add params to the cache path if provided
  if (params && Object.keys(params).length > 0) {
    const paramString = Object.entries(params)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // Sort for consistency
      .map(([key, value]) => `${key}-${value}`)
      .join('_');
    cleanEndpoint = `${cleanEndpoint}_${paramString}`;
  }
  
  return path.join(cacheDir, `${cleanEndpoint}.json`);
}

/**
 * Makes a cached API call with automatic caching
 * Cache files are treated as permanent storage and never expire
 * @param endpoint - The API endpoint (without base URL)
 * @param config - Configuration for the cached API call
 * @param params - Optional query parameters for the API call
 * @param fetchFunction - Optional custom fetch function (for testing)
 * @param fsModule - Optional custom fs module (for testing)
 * @returns Promise resolving to the parsed JSON response
 */
export async function makeCachedApiCall<T>(
  endpoint: string,
  config: CachedApiCallConfig,
  params?: Record<string, any>,
  fetchFunction: typeof fetch = fetch,
  fsModule: typeof fs = fs,
): Promise<T> {
  const {
    baseUrl,
    apiKey,
    cacheDir,
    format = "json",
    skipCache = false,
    forceRefresh = false,
  } = config;

  if (!apiKey) {
    throw createFetchError(
      "API key is required for cached API calls.",
    );
  }

  // Generate cache file path including params
  const cacheFilePath = getCacheFilePath(cacheDir, endpoint, params);

  // Check cache first (unless skipCache or forceRefresh is true)
  // forceRefresh: skip reading cache but still write to cache
  // skipCache: skip both reading and writing cache
  if (!skipCache && !forceRefresh && cacheExists(cacheFilePath, fsModule)) {
    try {
      const cachedData = fsModule.readFileSync(cacheFilePath, "utf8");
      const parsed = JSON.parse(cachedData);
      // Silently return cached data (logging would be too verbose for bulk operations)
      return parsed as T;
    } catch (cacheError) {
      console.warn(`Cache read error for ${endpoint}:`, cacheError);
      // Continue to fetch from API if cache read fails
    }
  }

  // Construct the full URL with query parameters
  const url = new URL(`${baseUrl}${endpoint}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", format);
  
  // Add additional params to URL
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  try {
    // Fetch from API
    const response = await makeHttpRequest<T>(url.toString(), {}, fetchFunction);

    // Save to cache (unless skipCache is true; forceRefresh still writes to cache)
    if (!skipCache) {
      try {
        // Ensure parent directory exists (including subdirectories)
        const cacheFileDir = path.dirname(cacheFilePath);
        fsModule.mkdirSync(cacheFileDir, { recursive: true });
        fsModule.writeFileSync(cacheFilePath, JSON.stringify(response, null, 2));
        // Log when writing NEW cache files (not when reading from cache)
        console.log(`Cached ${endpoint}`);
      } catch (cacheError) {
        console.warn(`Cache write error for ${endpoint}:`, cacheError);
        // Don't fail the request if caching fails
      }
    }

    return response;
  } catch (error) {
    if (isFetchError(error)) {
      console.error(`API Error for ${endpoint}:`, error.message);
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching ${endpoint}:`, errorMessage);
    throw createFetchError(`Error fetching ${endpoint}: ${errorMessage}`);
  }
}

/**
 * Clears API cache files, optionally filtered by endpoint pattern
 * @param cacheDir - Directory containing cached API files
 * @param endpointPattern - Optional pattern to match endpoint subdirectories (e.g., "member" for /member/* endpoints)
 * @param fsModule - Optional custom fs module (for testing)
 */
export function clearApiCache(
  cacheDir: string,
  endpointPattern?: string,
  fsModule: typeof fs = fs,
): void {
  try {
    if (!fsModule.existsSync(cacheDir)) {
      console.log(`Cache directory does not exist: ${cacheDir}`);
      return;
    }

    if (endpointPattern) {
      // Clear specific subdirectory matching the pattern
      const targetDir = path.join(cacheDir, endpointPattern);
      if (fsModule.existsSync(targetDir)) {
        fsModule.rmSync(targetDir, { recursive: true, force: true });
        console.log(`Cleared cached directory: ${targetDir}`);
      } else {
        console.log(`No cache directory found for pattern "${endpointPattern}"`);
      }
    } else {
      // Clear all cache
      fsModule.rmSync(cacheDir, { recursive: true, force: true });
      console.log(`Cleared all API cache in: ${cacheDir}`);
    }
  } catch (error) {
    console.warn(`Failed to clear API cache: ${error}`);
  }
}

