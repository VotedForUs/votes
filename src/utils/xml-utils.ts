import * as fs from "fs";
import * as path from "path";
import { XMLParser } from "fast-xml-parser";
import { CacheConfig } from "./cache-config.js";

/**
 * Configuration for XML download and caching
 */
export interface XmlDownloadConfig {
  /** URL to download the XML file from */
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
  /** Whether to parse XML to object (defaults to false) */
  parseXml?: boolean;
}

/**
 * Result of XML download operation
 */
export interface XmlDownloadResult<T = any> {
  /** The XML data (raw string or parsed object) */
  data: T;
  /** Whether the data was loaded from cache */
  fromCache: boolean;
  /** Cache file path if used */
  cachePath?: string;
  /** Download URL */
  url: string;
}


/**
 * XML utility class for downloading, caching, and parsing XML files
 * Cache files are treated as permanent storage and never expire
 */
export class XmlUtils {
  /**
   * XML parser instance configured for consistent parsing
   */
  private static readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: true,
    trimValues: true,
  });

  /**
   * Gets the default cache directory from centralized config
   */
  private static getDefaultCacheDir(): string {
    return CacheConfig.getRootCacheDir();
  }
  private static readonly DEFAULT_HEADERS = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0",
  };

  /**
   * Downloads and optionally parses an XML file with caching
   * Cache files are treated as permanent storage and never expire
   */
  static async downloadXml<T = any>(
    config: XmlDownloadConfig,
  ): Promise<XmlDownloadResult<T>> {
    const {
      url,
      cacheDir = this.getDefaultCacheDir(),
      cacheFilename,
      useCache = true,
      skipCache = false,
      headers = {},
      parseXml = false,
    } = config;

    // Merge default headers with custom headers
    const requestHeaders = { ...this.DEFAULT_HEADERS, ...headers };

    // Ensure cache directory exists
    if (useCache) {
      this.ensureCacheDirectory(cacheDir);
    }

    const cachePath = this.getCachePath(url, cacheDir, cacheFilename);

    // Check cache first (unless skipCache is true)
    if (useCache && !skipCache && fs.existsSync(cachePath)) {
      console.log(`Loading XML data from cache: ${path.basename(cachePath)}`);
      const cachedData = this.loadFromCache<T>(cachePath, parseXml);
      return {
        data: cachedData,
        fromCache: true,
        cachePath,
        url,
      };
    }

    // Download fresh data
    console.log(`📥 Downloading XML data from: ${url}`);
    const response = await fetch(url, {
      headers: requestHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rawXmlData = await response.text();

    let xmlData: T;
    if (parseXml) {
      xmlData = this.xmlParser.parse(rawXmlData) as T;
      console.log(`Successfully downloaded and parsed XML data`);
    } else {
      xmlData = rawXmlData as T;
      console.log(`Successfully downloaded XML data`);
    }

    // Save to cache
    if (useCache) {
      this.saveToCache(cachePath, rawXmlData); // Always save raw XML to cache
      console.log(`💾 Cached ${path.basename(cachePath)}`);
    }

    return {
      data: xmlData,
      fromCache: false,
      cachePath: useCache ? cachePath : undefined,
      url,
    };
  }

  /**
   * Downloads multiple XML files in parallel
   */
  static async downloadMultipleXml<T = any>(
    configs: XmlDownloadConfig[],
  ): Promise<XmlDownloadResult<T>[]> {
    return Promise.all(configs.map((config) => this.downloadXml<T>(config)));
  }

  /**
   * Downloads an XML file without caching
   */
  static async downloadXmlNoCache<T = any>(
    url: string,
    headers: Record<string, string> = {},
    parseXml: boolean = false,
  ): Promise<T> {
    const requestHeaders = { ...this.DEFAULT_HEADERS, ...headers };

    console.log(`📥 Downloading XML data from: ${url}`);
    const response = await fetch(url, {
      headers: requestHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rawXmlData = await response.text();

    if (parseXml) {
      const parsedData = this.xmlParser.parse(rawXmlData) as T;
      console.log(`Successfully downloaded and parsed XML data`);
      return parsedData;
    } else {
      console.log(`Successfully downloaded XML data`);
      return rawXmlData as T;
    }
  }

  /**
   * Loads XML data from cache file
   */
  static loadFromCache<T = any>(
    cachePath: string,
    parseXml: boolean = false,
  ): T {
    try {
      const data = fs.readFileSync(cachePath, "utf8");
      if (parseXml) {
        return this.xmlParser.parse(data) as T;
      }
      return data as T;
    } catch (error) {
      throw new Error(
        `Failed to load cached XML data from ${cachePath}: ${error}`,
      );
    }
  }

  /**
   * Saves XML data to cache file
   */
  static saveToCache(cachePath: string, data: string): void {
    try {
      fs.writeFileSync(cachePath, data, "utf8");
    } catch (error) {
      console.warn(`Failed to save XML data to cache ${cachePath}: ${error}`);
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
          console.log(`Cleared all XML cache in: ${cacheDir}`);
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
    const urlParts = url.split("/");
    const originalFilename = urlParts[urlParts.length - 1];

    if (originalFilename && originalFilename.includes(".")) {
      return path.join(cacheDir, originalFilename);
    }

    // If no filename in URL, create one based on the path
    const pathParts = url.split("/").filter((part) => part.length > 0);
    const lastPart = pathParts[pathParts.length - 1];
    return path.join(cacheDir, `${lastPart}.xml`);
  }

}
