/**
 * Mock implementation of CongressApi for testing
 */

import type { BillWithActions, PopulateRecordedVotesParams, BillActionWithVotes } from "../congress-api.types.js";

export class MockCongressApi {
  private static shouldThrowError = false;
  private static errorMessage = "Mock error";
  private static cacheClearCalled = false;
  private apiCallCount: number = 0;
  private static mockBills: BillWithActions[] = [
    {
      id: "119-HR-1234",
      congress: 119,
      number: "1234",
      type: "HR",
      title: "Test Bill",
      url: "https://api.congress.gov/v3/bill/119/hr/1234",
      originChamber: "House",
      originChamberCode: "H",
      updateDate: "2024-10-31",
      latestAction: {
        actionDate: "2024-10-31",
        text: "Passed House",
      },
      actions: {
        actions: [
          {
            actionDate: "2024-10-30",
            text: "Introduced in House",
            type: "IntroReferral",
            actionCode: "1000",
          },
          {
            actionDate: "2024-10-31",
            text: "Passed House",
            type: "Floor",
            actionCode: "H37300",
            recordedVotes: [
              {
                chamber: "House",
                congress: 119,
                date: "2024-10-31T12:00:00Z",
                rollNumber: 123,
                sessionNumber: 1,
                url: "https://clerk.house.gov/evs/2024/roll123.xml",
              },
            ],
          },
        ],
      },
    },
    {
      id: "119-S-5678",
      congress: 119,
      number: "5678",
      type: "S",
      title: "Another Test Bill",
      url: "https://api.congress.gov/v3/bill/119/s/5678",
      originChamber: "Senate",
      originChamberCode: "S",
      updateDate: "2024-10-30",
      latestAction: {
        actionDate: "2024-10-30",
        text: "Passed Senate",
      },
      actions: {
        actions: [
          {
            actionDate: "2024-10-29",
            text: "Introduced in Senate",
            type: "IntroReferral",
            actionCode: "10000",
          },
        ],
      },
    },
  ];

  congressionalTerm: number;

  constructor(congressionalTerm: number = 119) {
    this.congressionalTerm = congressionalTerm;
  }

  async ensureInitialized(): Promise<void> {
    // Mock implementation - no initialization needed
    return Promise.resolve();
  }

  getApiCallCount(): number {
    return this.apiCallCount;
  }

  resetApiCallCount(): void {
    this.apiCallCount = 0;
  }

  async getBills(
    billType?: string,
    includeActions: 'all' | 'votes' | 'none' = 'none',
    includeVotes: boolean = false,
    params?: {
      offset?: number;
      limit?: number;
      fromDateTime?: string;
      toDateTime?: string;
    }
  ): Promise<BillWithActions[]> {
    this.apiCallCount++; // Simulate an API call
    
    if (MockCongressApi.shouldThrowError) {
      throw new Error(MockCongressApi.errorMessage);
    }

    let bills = [...MockCongressApi.mockBills];

    // Filter by bill type if specified
    if (billType) {
      bills = bills.filter(b => b.type === billType);
    }

    // Filter based on includeActions parameter
    if (includeActions === 'all') {
      // Return bills with actions
      bills = bills.filter(b => 
        b.actions && b.actions.actions && b.actions.actions.length > 0
      );
    } else if (includeActions === 'votes') {
      // Return only bills with actions that have recorded votes
      bills = bills.filter(b => {
        if (!b.actions || !b.actions.actions) return false;
        // Filter the actions to only those with recorded votes
        const actionsWithVotes = b.actions.actions.filter(action => 
          action.recordedVotes && action.recordedVotes.length > 0
        );
        if (actionsWithVotes.length === 0) return false;
        // Update the bill to only include actions with votes
        b.actions.actions = actionsWithVotes;
        return true;
      });
    }
    // For 'none', return bills as-is (basic info without filtering actions)

    return bills;
  }

  async getBillsWithVotes(
    billType: string,
    params?: {
      offset?: number;
      limit?: number;
      fromDateTime?: string;
      toDateTime?: string;
    }
  ): Promise<BillWithActions[]> {
    this.apiCallCount++;
    
    if (MockCongressApi.shouldThrowError) {
      throw new Error(MockCongressApi.errorMessage);
    }

    // Filter to bills with recorded votes
    let bills = MockCongressApi.mockBills.filter(b => {
      if (b.type !== billType) return false;
      if (!b.actions?.actions) return false;
      return b.actions.actions.some(action => 
        Array.isArray(action.recordedVotes) && action.recordedVotes.length > 0
      );
    });

    return [...bills];
  }

  /**
   * Mock implementation of populateRecordedVotes
   * Returns actions with IDs assigned if params provided
   */
  async populateRecordedVotes(
    actions: BillActionWithVotes[],
    params?: PopulateRecordedVotesParams
  ): Promise<BillActionWithVotes[]> {
    // Assign IDs if params provided (mimics real behavior)
    if (params) {
      const allVotes: { vote: any }[] = [];
      for (const action of actions) {
        if (action.recordedVotes) {
          for (const vote of action.recordedVotes) {
            allVotes.push({ vote });
          }
        }
      }
      // Reverse: API returns newest-first, so reverse gives oldest-first
      const reversedVotes = [...allVotes].reverse();
      // Assign IDs
      reversedVotes.forEach((item, index) => {
        item.vote.id = `${params.congress}-${params.billType.toUpperCase()}-${params.billNumber}-${index + 1}`;
      });
    }
    return actions;
  }

  clearLegislatorsCache(): void {
    MockCongressApi.cacheClearCalled = true;
  }

  static wasCacheClearCalled(): boolean {
    return MockCongressApi.cacheClearCalled;
  }

  static setShouldThrowError(shouldThrow: boolean, message: string = "Mock error"): void {
    MockCongressApi.shouldThrowError = shouldThrow;
    MockCongressApi.errorMessage = message;
  }

  static setMockBills(bills: BillWithActions[]): void {
    MockCongressApi.mockBills = bills;
  }

  static getMockBills(): BillWithActions[] {
    return [...MockCongressApi.mockBills];
  }

  static reset(): void {
    MockCongressApi.shouldThrowError = false;
    MockCongressApi.errorMessage = "Mock error";
    MockCongressApi.cacheClearCalled = false;
    MockCongressApi.mockBills = [
      {
        id: "119-HR-1234",
        congress: 119,
        number: "1234",
        type: "HR",
        title: "Test Bill",
        url: "https://api.congress.gov/v3/bill/119/hr/1234",
        originChamber: "House",
        originChamberCode: "H",
        updateDate: "2024-10-31",
        latestAction: {
          actionDate: "2024-10-31",
          text: "Passed House",
        },
        actions: {
          actions: [
            {
              actionDate: "2024-10-30",
              text: "Introduced in House",
              type: "IntroReferral",
              actionCode: "1000",
            },
            {
              actionDate: "2024-10-31",
              text: "Passed House",
              type: "Floor",
              actionCode: "H37300",
              recordedVotes: [
                {
                  chamber: "House",
                  congress: 119,
                  date: "2024-10-31T12:00:00Z",
                  rollNumber: 123,
                  sessionNumber: 1,
                  url: "https://clerk.house.gov/evs/2024/roll123.xml",
                },
              ],
            },
          ],
        },
      },
      {
        id: "119-S-5678",
        congress: 119,
        number: "5678",
        type: "S",
        title: "Another Test Bill",
        url: "https://api.congress.gov/v3/bill/119/s/5678",
        originChamber: "Senate",
        originChamberCode: "S",
        updateDate: "2024-10-30",
        latestAction: {
          actionDate: "2024-10-30",
          text: "Passed Senate",
        },
        actions: {
          actions: [
            {
              actionDate: "2024-10-29",
              text: "Introduced in Senate",
              type: "IntroReferral",
              actionCode: "10000",
            },
          ],
        },
      },
    ];
  }
}

