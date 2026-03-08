import { XmlDownloadConfig, XmlDownloadResult } from "../xml-utils.js";

/**
 * Mock implementation of XmlUtils for testing
 */
export class MockXmlUtils {
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
   * Mock implementation of downloadXml
   */
  static async downloadXml<T = any>(
    config: XmlDownloadConfig,
  ): Promise<XmlDownloadResult<T>> {
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

    // Return empty data if no specific mock data
    return {
      data: {} as T,
      fromCache: false,
      url,
    };
  }
}
