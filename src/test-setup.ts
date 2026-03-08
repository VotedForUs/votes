/**
 * Test setup utilities for @votedforus/votes tests
 * Sets up environment variables and provides test constants
 */

// Test API key used across all tests
export const TEST_API_KEY = 'test-api-key-for-testing-only';

/**
 * Sets up the test environment with required environment variables
 * Call this at the start of test files that use the Congress API
 */
export function setupTestEnvironment(): void {
  process.env.CONGRESS_API_KEY = TEST_API_KEY;
}

/**
 * Cleans up the test environment
 * Call this after tests complete
 */
export function cleanupTestEnvironment(): void {
  delete process.env.CONGRESS_API_KEY;
}
