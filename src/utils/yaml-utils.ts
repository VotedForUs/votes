import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { CacheConfig } from "./cache-config.js";

/**
 * Configuration for YAML download and caching
 */
export interface YamlDownloadConfig {
  /** URL to download the YAML file from */
  url: string;
  /** Local cache directory (defaults to workspace root .cache) */
  cacheDir?: string;
  /** Cache filename (defaults to URL filename or generated from URL) */
  cacheFilename?: string;
  /** Whether to use caching (defaults to true) */
  useCache?: boolean;
  /** Whether to skip cache and force fresh download (defaults to false) */
  skipCache?: boolean;
  /** Custom headers for the HTTP request */
  headers?: Record<string, string>;
}

/**
 * Result of YAML download operation
 */
export interface YamlDownloadResult<T = any> {
  /** The parsed YAML data */
  data: T;
  /** Whether the data was loaded from cache */
  fromCache: boolean;
  /** Cache file path if used */
  cachePath?: string;
  /** Download URL */
  url: string;
}


/**
 * YAML utility class for downloading, caching, and parsing YAML files
 * Cache files are treated as permanent storage and never expire
 */
export class YamlUtils {
  /**
   * Gets the default cache directory from centralized config
   */
  private static getDefaultCacheDir(): string {
    return CacheConfig.getRootCacheDir();
  }

  /**
   * Downloads and parses a YAML file with optional caching
   * Cache files are treated as permanent storage and never expire
   */
  static async downloadYaml<T = any>(
    config: YamlDownloadConfig,
  ): Promise<YamlDownloadResult<T>> {
    const {
      url,
      cacheDir = this.getDefaultCacheDir(),
      cacheFilename,
      useCache = true,
      skipCache = false,
      headers = {},
    } = config;

    // Ensure cache directory exists
    if (useCache) {
      this.ensureCacheDirectory(cacheDir);
    }

    const cachePath = this.getCachePath(url, cacheDir, cacheFilename);

    // Check cache first (unless skipCache is true)
    if (useCache && !skipCache && fs.existsSync(cachePath)) {
      console.log(`Loading YAML data from cache: ${cachePath}`);
      const cachedData = this.loadFromCache<T>(cachePath);
      return {
        data: cachedData,
        fromCache: true,
        cachePath,
        url,
      };
    }

    // Download fresh data
    console.log(`Downloading YAML data from: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const yamlText = await response.text();
    const yamlData = yaml.load(yamlText) as T;
    console.log(`Successfully downloaded and parsed YAML data`);

    // Save to cache
    if (useCache) {
      this.saveToCache(cachePath, yamlData);
      console.log(`YAML data cached to: ${cachePath}`);
    }

    return {
      data: yamlData,
      fromCache: false,
      cachePath: useCache ? cachePath : undefined,
      url,
    };
  }

  /**
   * Downloads multiple YAML files in parallel
   */
  static async downloadMultipleYaml<T = any>(
    configs: YamlDownloadConfig[],
  ): Promise<YamlDownloadResult<T>[]> {
    return Promise.all(configs.map((config) => this.downloadYaml<T>(config)));
  }

  /**
   * Downloads a YAML file without caching
   */
  static async downloadYamlNoCache<T = any>(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<T> {
    console.log(`Downloading YAML data from: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const yamlText = await response.text();
    const yamlData = yaml.load(yamlText) as T;
    console.log(`Successfully downloaded and parsed YAML data`);
    return yamlData;
  }

  /**
   * Loads YAML data from cache file
   */
  static loadFromCache<T = any>(cachePath: string): T {
    try {
      const data = fs.readFileSync(cachePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to load cached YAML data from ${cachePath}: ${error}`,
      );
    }
  }

  /**
   * Saves YAML data to cache file
   */
  static saveToCache<T = any>(cachePath: string, data: T): void {
    try {
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn(`Failed to save YAML data to cache ${cachePath}: ${error}`);
    }
  }

  /**
   * Clears cache for a specific URL or all cache
   */
  static clearCache(
    cacheDir: string = this.getDefaultCacheDir(),
    url?: string,
  ): void {
    try {
      if (url) {
        const cachePath = this.getCachePath(url, cacheDir);
        if (fs.existsSync(cachePath)) {
          fs.unlinkSync(cachePath);
          console.log(`Cleared cache for: ${url}`);
        }
      } else {
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true });
          console.log(`Cleared all YAML cache in: ${cacheDir}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to clear cache: ${error}`);
    }
  }

  /**
   * Gets cache statistics
   */
  static getCacheStats(cacheDir: string = this.getDefaultCacheDir()): {
    totalFiles: number;
    totalSize: number;
    files: Array<{ name: string; size: number; lastModified: Date }>;
  } {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      files: [] as Array<{ name: string; size: number; lastModified: Date }>,
    };

    try {
      if (!fs.existsSync(cacheDir)) {
        return stats;
      }

      const files = fs.readdirSync(cacheDir);
      for (const file of files) {
        const filePath = path.join(cacheDir, file);
        const fileStats = fs.statSync(filePath);

        if (fileStats.isFile()) {
          stats.totalFiles++;
          stats.totalSize += fileStats.size;
          stats.files.push({
            name: file,
            size: fileStats.size,
            lastModified: fileStats.mtime,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to get cache stats: ${error}`);
    }

    return stats;
  }

  /**
   * Ensures cache directory exists
   */
  private static ensureCacheDirectory(cacheDir: string): void {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  /**
   * Gets cache file path for a URL
   */
  private static getCachePath(
    url: string,
    cacheDir: string,
    customFilename?: string,
  ): string {
    if (customFilename) {
      return path.join(cacheDir, customFilename);
    }

    // Extract filename from URL or generate one
    const urlPath = new URL(url).pathname;
    const urlFilename = path.basename(urlPath);

    if (urlFilename && urlFilename !== "/") {
      return path.join(cacheDir, urlFilename.replace(/\.yaml$/, ".json"));
    }

    // Generate filename from URL hash
    const urlHash = Buffer.from(url)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "");
    return path.join(cacheDir, `${urlHash}.json`);
  }

}
