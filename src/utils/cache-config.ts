import * as path from "path";

/**
 * Centralized cache configuration for the votes package
 * Ensures all cache operations use the same root cache directory
 * 
 * Cache files are treated as permanent/long-term storage and never expire based on age.
 * Cache should only be cleared manually via clearCache() methods or by deleting cache directories.
 */
export class CacheConfig {
  private static _rootCacheDir: string | null = null;

  /**
   * Gets the root cache directory, resolving it from the workspace root
   * This ensures both the votes and site packages use the same cache
   */
  static getRootCacheDir(): string {
    if (this._rootCacheDir === null) {
      // Find the workspace root by looking for package.json
      let currentDir = process.cwd();
      let workspaceRoot = currentDir;

      // Look for the root package.json (the one that contains both packages)
      while (currentDir !== path.dirname(currentDir)) {
        const packageJsonPath = path.join(currentDir, "package.json");
        try {
          const packageJson = require(packageJsonPath);
          // Check if this is the workspace root (has workspaces or contains both packages)
          if (packageJson.workspaces || 
              (packageJson.name && packageJson.name.includes("votes-app"))) {
            workspaceRoot = currentDir;
            break;
          }
        } catch (e) {
          // package.json doesn't exist or can't be read, continue up
        }
        currentDir = path.dirname(currentDir);
      }

      this._rootCacheDir = path.join(workspaceRoot, ".cache");
    }

    return this._rootCacheDir;
  }

  /**
   * Gets a subdirectory within the cache
   */
  static getCacheDir(...subdirs: string[]): string {
    return path.join(this.getRootCacheDir(), ...subdirs);
  }

  /**
   * Gets the legislators cache directory
   */
  static getLegislatorsCacheDir(): string {
    return this.getCacheDir("legislators");
  }

  /**
   * Gets the bills cache directory
   */
  static getBillsCacheDir(congress?: number, billType?: string): string {
    const dirs = ["bills"];
    if (congress) dirs.push(congress.toString());
    if (billType) dirs.push(billType);
    return this.getCacheDir(...dirs);
  }

  /**
   * Gets the votes cache directory
   */
  static getVotesCacheDir(): string {
    return this.getCacheDir("votes");
  }

  /**
   * Override the root cache directory (useful for testing)
   */
  static setRootCacheDir(dir: string): void {
    this._rootCacheDir = dir;
  }

  /**
   * Reset the cache directory to auto-detect (useful for testing)
   */
  static resetCacheDir(): void {
    this._rootCacheDir = null;
  }
}
