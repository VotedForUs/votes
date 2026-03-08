import * as fs from "fs";

/**
 * Mock implementation of fs module for testing
 */
export class MockFsUtils {
  private static writeFileSyncCalls: string[] = [];
  private static readFileSyncCalls: string[] = [];
  private static originalFs: any = null;

  /**
   * Set mock data for a specific file path
   */
  static setMockData(filePath: string, data: string): void {
    this.mockFsModule.readFileSync = (path: string) => {
      this.readFileSyncCalls.push(path);
      if (path === filePath) {
        return data;
      }
      // Default mock data for other paths
      if (path.includes("test-file.json")) {
        return JSON.stringify({
          legislators: [
            {
              id: { bioguide: "TEST001" },
              name: { first: "Test", last: "User" },
              bio: {},
              terms: [],
              social: {},
            },
          ],
        });
      }
      if (path.includes("invalid.json")) {
        throw new Error("Invalid JSON file");
      }
      return JSON.stringify({ legislators: [] });
    };
  }

  /**
   * Mock fs module that can be injected into classes
   */
  static mockFsModule = {
    writeFileSync: (filePath: string, _data: string) => {
      MockFsUtils.writeFileSyncCalls.push(filePath);
      console.log(`Mock writeFileSync: ${filePath}`);
    },
    readFileSync: (filePath: string) => {
      MockFsUtils.readFileSyncCalls.push(filePath);
      if (filePath.includes("test-file.json")) {
        return JSON.stringify({
          legislators: [
            {
              id: { bioguide: "TEST001" },
              name: { first: "Test", last: "User" },
              bio: {},
              terms: [],
              social: {},
            },
          ],
        });
      }
      if (filePath.includes("legislators-current.json")) {
        // Return mock legislator data for any legislators-current.json file
        return JSON.stringify({
          legislators: [
            {
              id: { bioguide: "A000001" },
              name: { first: "Alex", last: "Anderson" },
              bio: { birthday: "1980-01-01" },
              terms: [{
                type: "rep",
                start: "2023-01-03",
                end: "2025-01-03",
                state: "CA",
                district: 1,
                party: "Republican"
              }],
              social: {},
            },
          ],
        });
      }
      if (filePath.includes("invalid.json")) {
        return "invalid json";
      }
      if (filePath.includes("non-existent.json")) {
        throw new Error("File not found");
      }
      return JSON.stringify({ legislators: [] });
    },
    existsSync: () => true,
    mkdirSync: (dirPath: string, options?: any) => {
      console.log(`Mock mkdirSync: ${dirPath}`);
      // Mock implementation - just log the call
    },
  };

  /**
   * Simple mock for fs module
   */
  private static mockFs = {
    writeFileSync: (filePath: string, _data: string) => {
      console.log(`Mock writeFileSync: ${filePath}`);
    },
    readFileSync: (filePath: string) => {
      if (filePath.includes("test-file.json")) {
        return JSON.stringify({
          legislators: [
            {
              id: { bioguide: "TEST001" },
              name: { first: "Test", last: "User" },
              bio: {},
              terms: [],
              social: {},
            },
          ],
        });
      }
      if (filePath.includes("legislators-current.json")) {
        // Return mock legislator data for any legislators-current.json file
        return JSON.stringify({
          legislators: [
            {
              id: { bioguide: "A000001" },
              name: { first: "Alex", last: "Anderson" },
              bio: { birthday: "1980-01-01" },
              terms: [{
                type: "rep",
                start: "2023-01-03",
                end: "2025-01-03",
                state: "CA",
                district: 1,
                party: "Republican"
              }],
              social: {},
            },
          ],
        });
      }
      if (filePath.includes("invalid.json")) {
        return "invalid json";
      }
      if (filePath.includes("non-existent.json")) {
        throw new Error("File not found");
      }
      return JSON.stringify({ legislators: [] });
    },
    existsSync: () => true,
    mkdirSync: (dirPath: string, options?: any) => {
      console.log(`Mock mkdirSync: ${dirPath}`);
    },
  };

  /**
   * Track calls to fs methods
   */
  private static trackedFs = {
    writeFileSync: (filePath: string, data: string) => {
      this.writeFileSyncCalls.push(filePath);
      this.mockFs.writeFileSync(filePath, data);
    },
    readFileSync: (filePath: string) => {
      this.readFileSyncCalls.push(filePath);
      return this.mockFs.readFileSync(filePath);
    },
    existsSync: this.mockFs.existsSync,
    mkdirSync: this.mockFs.mkdirSync,
  };

  /**
   * Set up fs mocking
   */
  static setup(): void {
    this.originalFs = {
      writeFileSync: fs.writeFileSync,
      readFileSync: fs.readFileSync,
      existsSync: fs.existsSync,
    };
    (fs as any).writeFileSync = this.trackedFs.writeFileSync;
    (fs as any).readFileSync = this.trackedFs.readFileSync;
    (fs as any).existsSync = this.trackedFs.existsSync;
  }

  /**
   * Restore original fs implementation
   */
  static restore(): void {
    if (this.originalFs) {
      (fs as any).writeFileSync = this.originalFs.writeFileSync;
      (fs as any).readFileSync = this.originalFs.readFileSync;
      (fs as any).existsSync = this.originalFs.existsSync;
      this.originalFs = null;
    }
  }

  /**
   * Reset call tracking
   */
  static reset(): void {
    this.writeFileSyncCalls = [];
    this.readFileSyncCalls = [];
  }

  /**
   * Get writeFileSync calls
   */
  static getWriteFileSyncCalls(): string[] {
    return [...this.writeFileSyncCalls];
  }

  /**
   * Get readFileSync calls
   */
  static getReadFileSyncCalls(): string[] {
    return [...this.readFileSyncCalls];
  }

  /**
   * Set custom mock data for readFileSync
   */
  static setMockReadFileSyncData(filePath: string, data: string): void {
    const originalReadFileSync = this.mockFs.readFileSync;
    this.mockFs.readFileSync = (path: string) => {
      if (path === filePath) {
        return data;
      }
      return originalReadFileSync(path);
    };
  }

  /**
   * Set custom mock behavior for existsSync
   */
  static setMockExistsSync(shouldExist: boolean): void {
    this.mockFs.existsSync = () => shouldExist;
  }
}
