import { YamlDownloadConfig, YamlDownloadResult } from "../yaml-utils.js";
// import { RawLegislatorsData, RawLegislatorsSocialMediaData } from '../../legislators/congress-legislators.types.js'; // Unused import
import {
  mockLegislatorsData,
  mockSocialMediaData,
} from "../../legislators/mocks/mock-data.js";

/**
 * Mock implementation of YamlUtils for testing
 */
export class MockYamlUtils {
  private static mockData: Map<string, any> = new Map();
  private static shouldThrowError = false;
  private static errorMessage = "Mock error";

  /**
   * Set up mock data for a specific URL
   */
  static setMockData(url: string, data: any): void {
    this.mockData.set(url, data);
  }

  /**
   * Configure whether the mock should throw an error
   */
  static setShouldThrowError(
    shouldThrow: boolean,
    message: string = "Mock error",
  ): void {
    this.shouldThrowError = shouldThrow;
    this.errorMessage = message;
  }

  /**
   * Reset all mock state
   */
  static reset(): void {
    this.mockData.clear();
    this.shouldThrowError = false;
    this.errorMessage = "Mock error";
  }

  /**
   * Mock implementation of downloadYaml
   */
  static async downloadYaml<T = any>(
    config: YamlDownloadConfig,
  ): Promise<YamlDownloadResult<T>> {
    if (this.shouldThrowError) {
      throw new Error(this.errorMessage);
    }

    const { url } = config;

    // Check if we have mock data for this URL
    if (this.mockData.has(url)) {
      return {
        data: this.mockData.get(url),
        fromCache: false,
        url,
      };
    }

    // Default mock data based on URL
    if (url.includes("legislators-current.yaml")) {
      return {
        data: mockLegislatorsData as T,
        fromCache: false,
        url,
      };
    }

    if (url.includes("legislators-social-media.yaml")) {
      return {
        data: mockSocialMediaData as T,
        fromCache: false,
        url,
      };
    }

    // If no specific mock data, return empty array
    return {
      data: [] as T,
      fromCache: false,
      url,
    };
  }

  /**
   * Mock implementation of downloadMultipleYaml
   */
  static async downloadMultipleYaml<T = any>(
    configs: YamlDownloadConfig[],
  ): Promise<YamlDownloadResult<T>[]> {
    if (this.shouldThrowError) {
      throw new Error(this.errorMessage);
    }

    return Promise.all(configs.map((config) => this.downloadYaml<T>(config)));
  }

  /**
   * Mock implementation of downloadYamlNoCache
   */
  static async downloadYamlNoCache<T = any>(
    url: string,
    _headers: Record<string, string> = {},
  ): Promise<T> {
    if (this.shouldThrowError) {
      throw new Error(this.errorMessage);
    }

    if (this.mockData.has(url)) {
      return this.mockData.get(url);
    }

    // Default mock data based on URL
    if (url.includes("legislators-current.yaml")) {
      return mockLegislatorsData as T;
    }

    if (url.includes("legislators-social-media.yaml")) {
      return mockSocialMediaData as T;
    }

    return [] as T;
  }

  /**
   * Mock implementation of loadFromCache
   */
  static loadFromCache<T = any>(cachePath: string): T {
    if (this.shouldThrowError) {
      throw new Error(this.errorMessage);
    }

    // Return mock data based on cache path
    if (cachePath.includes("legislators-current")) {
      return mockLegislatorsData as T;
    }

    if (cachePath.includes("legislators-social-media")) {
      return mockSocialMediaData as T;
    }

    return [] as T;
  }

  /**
   * Mock implementation of saveToCache
   */
  static saveToCache<T = any>(cachePath: string, data: T): void {
    if (this.shouldThrowError) {
      throw new Error(this.errorMessage);
    }

    // Mock implementation - just store the data
    this.mockData.set(cachePath, data);
  }

  /**
   * Mock implementation of clearCache
   */
  static clearCache(
    _cacheDir: string = "../../.cache/yaml",
    url?: string,
  ): void {
    if (this.shouldThrowError) {
      throw new Error(this.errorMessage);
    }

    if (url) {
      this.mockData.delete(url);
    } else {
      this.mockData.clear();
    }
  }

  /**
   * Mock implementation of getCacheStats
   */
  static getCacheStats(_cacheDir: string = "../../.cache/yaml"): {
    totalFiles: number;
    totalSize: number;
    files: Array<{ name: string; size: number; lastModified: Date }>;
  } {
    if (this.shouldThrowError) {
      throw new Error(this.errorMessage);
    }

    return {
      totalFiles: this.mockData.size,
      totalSize: this.mockData.size * 1024, // Mock size
      files: Array.from(this.mockData.keys()).map((key, index) => ({
        name: key,
        size: 1024,
        lastModified: new Date(Date.now() - index * 1000),
      })),
    };
  }
}
