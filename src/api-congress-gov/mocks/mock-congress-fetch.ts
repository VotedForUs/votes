import {
  mockCongressVoteListResponse,
  mockCongressMembersResponse,
  mockCongressBillInfo,
  mockErrorResponses,
} from "./mock-congress-data.js";

/**
 * Mock fetch implementation for Congress API endpoints
 */
export class MockCongressFetch {
  private static responses: Map<string, any> = new Map();
  private static shouldThrowError = false;
  private static errorMessage = "Mock fetch error";
  private static errorStatus = 500;

  /**
   * Set a custom response for a specific URL
   */
  static setResponse(url: string, response: any): void {
    this.responses.set(url, response);
  }

  /**
   * Configure whether the mock should throw an error
   */
  static setShouldThrowError(
    shouldThrow: boolean,
    message: string = "Mock fetch error",
    status: number = 500,
  ): void {
    this.shouldThrowError = shouldThrow;
    this.errorMessage = message;
    this.errorStatus = status;
  }

  /**
   * Set up error response for specific HTTP status codes
   */
  static setErrorResponse(status: number, url?: string): void {
    const response = this.getErrorResponseForStatus(status);
    if (url) {
      this.setResponse(url, { response, status });
    } else {
      this.setShouldThrowError(false);
      this.errorStatus = status;
    }
  }

  /**
   * Get error response data for specific status codes
   */
  private static getErrorResponseForStatus(status: number): any {
    switch (status) {
      case 401:
        return mockErrorResponses.unauthorized;
      case 403:
        return mockErrorResponses.forbidden;
      case 404:
        return mockErrorResponses.notFound;
      case 429:
        return mockErrorResponses.rateLimit;
      case 500:
        return mockErrorResponses.serverError;
      default:
        return { error: `HTTP ${status} error` };
    }
  }

  /**
   * Reset all mock state
   */
  static reset(): void {
    this.responses.clear();
    this.shouldThrowError = false;
    this.errorMessage = "Mock fetch error";
    this.errorStatus = 500;
  }

  /**
   * Mock fetch function for Congress API endpoints
   */
  static async mockFetch(
    url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> {
    if (MockCongressFetch.shouldThrowError) {
      throw new Error(MockCongressFetch.errorMessage);
    }

    const urlString = url.toString();

    // Check for custom responses first
    if (MockCongressFetch.responses.has(urlString)) {
      const responseData = MockCongressFetch.responses.get(urlString);
      
      if (responseData.status && responseData.status !== 200) {
        return new Response(JSON.stringify(responseData.response), {
          status: responseData.status,
          statusText: MockCongressFetch.getStatusText(responseData.status),
          headers: { "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify(responseData), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
    }

    // House votes list endpoint - match the exact pattern from the API
    if (
      urlString.includes("/house-vote/119/1") &&
      !urlString.includes("/members") &&
      !urlString.match(/\/house-vote\/119\/1\/\d+/)
    ) {
      return new Response(JSON.stringify(mockCongressVoteListResponse), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
    }

    // House vote details and members endpoints
    const voteDetailMatch = urlString.match(
      /\/house-vote\/119\/1\/(\d+)(?:\/members)?(?:\?|$)/,
    );
    if (voteDetailMatch) {
      const voteNumber = parseInt(voteDetailMatch[1]);

      if (urlString.includes("/members")) {
        // Vote members endpoint
        return new Response(JSON.stringify(mockCongressMembersResponse), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        });
      } else {
        // Vote details endpoint - create dynamic response based on vote number
        const voteData = {
          congress: 119,
          rollCallNumber: voteNumber,
          startDate: "2025-01-03T10:00:00Z",
          result: voteNumber === 2 ? "Failed" : "Passed",
          voteType: "Recorded Vote" as const,
          legislationType: "HR",
          legislationNumber: voteNumber.toString(),
          legislationUrl: `https://api.congress.gov/v3/bill/119/house-bill/${voteNumber}`,
        };
        const response = { vote: voteData };
        return new Response(JSON.stringify(response), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Bill info endpoint
    const billMatch = urlString.match(/\/bill\/119\/([a-z]+)\/(\d+)(?:\?|$)/);
    if (billMatch) {
      const billType = billMatch[1];
      const billNumber = parseInt(billMatch[2]);
      
      if (billType === "hr" && billNumber === 1) {
        return new Response(JSON.stringify({ bill: mockCongressBillInfo }), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        });
      } else {
        // Return 404 for other bills
        return new Response(
          JSON.stringify(mockErrorResponses.notFound),
          {
            status: 404,
            statusText: "Not Found",
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Handle API key authentication errors
    if (!urlString.includes("api_key=")) {
      return new Response(
        JSON.stringify(mockErrorResponses.unauthorized),
        {
          status: 401,
          statusText: "Unauthorized",
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Default 404 response for unmatched endpoints
    return new Response(
      JSON.stringify({
        error: "No data matches the given query.",
        request: { url: urlString },
      }),
      {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Get status text for HTTP status codes
   */
  private static getStatusText(status: number): string {
    switch (status) {
      case 200:
        return "OK";
      case 401:
        return "Unauthorized";
      case 403:
        return "Forbidden";
      case 404:
        return "Not Found";
      case 429:
        return "Too Many Requests";
      case 500:
        return "Internal Server Error";
      default:
        return "Unknown";
    }
  }

  /**
   * Helper method to create a mock response with specific status
   */
  static createMockResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      statusText: this.getStatusText(status),
      headers: { "Content-Type": "application/json" },
    });
  }
}
