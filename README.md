# @votedforus/votes

TypeScript library and CLI for fetching and analyzing U.S. Congressional floor votes from both House and Senate. Provides comprehensive access to Congress.gov API data with intelligent caching, vote details, and legislator information.

## Features

- Fetch bills, votes, and legislator data from Congress.gov API
- Automatic pagination handling for large datasets
- Intelligent caching with permanent storage
- House and Senate vote details with member voting records
- Legislator data merging from multiple sources (API, YAML, XML)
- CLI tools for generating data files
- Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install @votedforus/votes
```

## Configuration

### API Key Setup (Required)

This package requires a Congress.gov API key. Get your free API key at: https://api.congress.gov/sign-up/

#### Option 1: Using a `.env` file (Recommended)

Create a `.env` file in your project root:

```bash
CONGRESS_API_KEY=your-api-key-here
```

The CLI automatically loads `.env` files from the current directory and parent directories (up to 3 levels).

#### Option 2: Environment variable

```bash
export CONGRESS_API_KEY=your-api-key-here
```

#### Option 3: In Node.js code

```typescript
process.env.CONGRESS_API_KEY = 'your-api-key-here';
```

## Programmatic API Usage

### CongressApi Class

The main class for fetching congressional data:

```typescript
import { CongressApi } from '@votedforus/votes';

// Initialize with default congressional term (119th Congress)
const api = new CongressApi();

// Or specify a different term
const api118 = new CongressApi(118);

// Get a bill with actions and votes
const bill = await api.getBill('hr', '1', 'votes', true);
// bill contains: bill details, actions with recorded votes, vote tallies

// Get all bills with recorded votes for a bill type
const hrBills = await api.getBillsWithVotes('hr');

// Get bills with various options
const bills = await api.getBills(
  'hr',        // billType (optional)
  'votes',     // includeActions: 'all' | 'votes' | 'none'
  true,        // includeVotes: fetch vote details
  { limit: 50 } // pagination options
);
```

### Legislators Class

For fetching and managing legislator data:

```typescript
import { Legislators } from '@votedforus/votes';

const legislators = new Legislators();

// Get all current legislators
const all = await legislators.getAllLegislators(true); // true = current members only

// Get a specific legislator by bioguide ID
const member = await legislators.getLegislator('P000197');

// Get legislators by chamber
const senators = await legislators.getLegislatorsByChamber('senate');
const representatives = await legislators.getLegislatorsByChamber('house');

// Get legislators by party or state
const democrats = await legislators.getLegislatorsByParty('D');
const texasLegislators = await legislators.getLegislatorsByState('TX');
```

### Type Exports

```typescript
import type {
  // Legislator types
  Legislator,
  LegislatorBio,
  LegislatorId,
  LegislatorSmall,
  
  // Bill types
  BaseBillSummary,
  ExtendedBillSummary,
  BillAction,
  BillWithActions,
  BillTitle,
  RecordedVote,
  
  // Vote types
  HouseRollCallVote,
  HouseVoteMember,
  SenateVote,
  ChamberVote,
  
  // Member types
  MemberInfo,
  MemberTerm,
} from '@votedforus/votes';
```

## CLI Commands

The package provides a CLI tool `vfu` (Voted For Us) for generating data files.

### Global CLI Installation

```bash
# Install globally
npm install -g @votedforus/votes

# Use the CLI
vfu legislators --help
vfu bills --help
```

### Running via npm scripts (from monorepo)

```bash
# From the monorepo root
npm run votes:legislators:generate
npm run votes:bills:generate
```

### Commands Reference

#### `vfu legislators` - Generate Legislators Data

Generates a JSON file containing legislator data merged from multiple sources.

```bash
vfu legislators [options]

Options:
  -o, --output <path>    Output file path (default: .cache/all-legislators.json)
  -a, --all-members      Include all members, not just current (default: false)
  -s, --small            Output reduced legislator data (default: false)
```

**Examples:**

```bash
# Generate current legislators with full data
vfu legislators

# Generate with reduced data format for smaller file size
vfu legislators --small --output ./legislators.json

# Include historical members
vfu legislators --all-members
```

#### `vfu bills` - Generate Bills Data

Fetches bills with optional filtering and vote data.

```bash
vfu bills [options]

Options:
  -o, --output <path>         Output file path (default: .cache/bills-{term}.json)
  -t, --term <number>         Congressional term (default: 119)
  -b, --bill-type <type>      Bill type filter (e.g., hr, s, hjres, sjres)
  --no-skip-cache             Use cache for API calls (default: skip cache)
  -s, --small                 Output reduced bill data (default: false)
  -a, --actions <type>        Include actions: "all", "votes", or "none" (default: votes)
  -v, --include-votes <type>  Include votes: "all", "only", or "none" (default: only)
  -l, --limit <number>        Limit number of bills to fetch
```

**Examples:**

```bash
# Get all HR bills with recorded votes
vfu bills --bill-type hr

# Get first 10 Senate bills with all actions
vfu bills --bill-type s --actions all --include-votes all --limit 10

# Get bills without vote details (faster)
vfu bills --bill-type hr --include-votes none
```

#### `vfu voted-bills` - Optimized Bills with Votes

Fetches only bills that have recorded votes, optimized for performance.

```bash
vfu voted-bills --bill-type <type> [options]

Options:
  -b, --bill-type <type>  Bill type (required: hr, s, hjres, sjres, etc.)
  -o, --output <path>     Output file path
  -t, --term <number>     Congressional term (default: 119)
  -s, --small             Output reduced bill data (default: true)
  --no-small              Output full bill data
  -l, --limit <number>    Limit number of bills
```

**Examples:**

```bash
# Get HR bills with recorded votes (reduced data)
vfu voted-bills --bill-type hr

# Get full bill data
vfu voted-bills --bill-type s --no-small

# Limit to 5 bills for testing
vfu voted-bills --bill-type hr --limit 5
```

#### `vfu bills-all` - Generate All Bill Types

Captures bills with recorded votes for all bill types in one command.

```bash
vfu bills-all [options]

Options:
  -o, --output <path>    Output directory path (default: .cache/)
  -t, --term <number>    Congressional term (default: 119)
  --no-skip-cache        Use cache for API calls
  -s, --small            Output reduced bill data (default: false)
  -l, --limit <number>   Limit per bill type
```

**Examples:**

```bash
# Generate all bill types
vfu bills-all

# Generate with limit for testing
vfu bills-all --limit 5 --small
```

#### `vfu types` - Process TypeScript Declarations

Processes TypeScript declaration files for publishing.

```bash
vfu types [options]

Options:
  -i, --input <path>   Input .d.ts file (default: ./dist/index.d.ts)
  -o, --output <path>  Output .d.ts file (default: ./dist/index.d.ts)
```

### Bill Types

The following bill types are supported:

| Type | Description |
|------|-------------|
| `hr` | House Resolution |
| `s` | Senate Bill |
| `hjres` | House Joint Resolution |
| `sjres` | Senate Joint Resolution |
| `hconres` | House Concurrent Resolution |
| `sconres` | Senate Concurrent Resolution |
| `hres` | House Simple Resolution |
| `sres` | Senate Simple Resolution |

## Data Sources

This package aggregates data from multiple sources:

1. **Congress.gov API** (`api.congress.gov/v3`)
   - Bills, actions, and titles
   - Member information
   - House vote details and member votes
   
2. **Senate.gov XML** (`senate.gov/legislative/LIS`)
   - Senate roll call vote XML files
   - Senate member data
   
3. **congress-legislators GitHub** (`github.com/unitedstates/congress-legislators`)
   - `legislators-current.yaml` - Current legislators
   - `legislators-social-media.yaml` - Social media handles

## Caching

The library uses intelligent caching to minimize API calls:

- **Cache Directory**: `.cache/` in the working directory
- **Congress API Cache**: `.cache/congress/` - mirrors API endpoint structure
- **Legislators Cache**: `.cache/legislators/` - YAML and XML source files
- **Senate Votes Cache**: `.cache/congress/senate/` - Senate XML vote files

Cache files are treated as permanent storage. Use `--no-skip-cache` in CLI commands to read from cache, or delete the `.cache/` directory to force fresh downloads.

## Development

### Prerequisites

- Node.js 24+ (see `.nvmrc`)
- npm 11+

### Setup

```bash
# From monorepo root
npm install

# Use correct Node version
nvm use
```

### Building

```bash
# Build the package
npm run build --workspace=packages/votes

# Or from monorepo root
npm run votes:build
```

### Testing

Tests use Node.js native test runner with mock utilities.

```bash
# Run all tests with coverage
npm run test:coverage --workspace=packages/votes

# Run specific test suites
npm run test:cli --workspace=packages/votes
npm run test:api-congress --workspace=packages/votes
npm run test:congress --workspace=packages/votes
npm run test:legislators --workspace=packages/votes
npm run test:utils --workspace=packages/votes

# Type checking
npm run test:types --workspace=packages/votes
```

### Mock Utilities (monorepo development only)

Imports from `@votedforus/votes/src/...` (e.g. `src/utils/mocks/`, `src/test-setup`) are for **monorepo development only** and are not included in the published npm package (source is excluded from the tarball). When developing within this repo, tests use npm packages `fetch-mock` and `mock-fs` for HTTP and filesystem mocking.

### Type Generation

```bash
# Generate TypeScript declaration file
npm run build:typesfile --workspace=packages/votes

# Generate Zod schemas from types
npm run build:schema --workspace=packages/votes
```

## Architecture

```
packages/votes/
├── index.ts                 # Main exports
├── src/
│   ├── api-congress-gov/    # Low-level Congress.gov API
│   │   ├── abstract-api.ts  # Base API class with raw endpoints
│   │   └── abstract-api.types.ts  # API response types
│   ├── congress/            # Higher-level Congress API
│   │   ├── congress-api.ts  # CongressApi class
│   │   └── congress-api.types.ts  # Domain types
│   ├── legislators/         # Legislator data management
│   │   ├── legislators.ts   # Legislators class
│   │   └── legislators.types.ts   # Legislator types
│   ├── cli/                 # CLI commands
│   │   ├── index.ts         # CLI entry point
│   │   ├── bills.ts         # Bills CLI logic
│   │   ├── legislators.ts   # Legislators CLI logic
│   │   └── types.ts         # Types CLI logic
│   ├── utils/               # Utilities
│   │   ├── fetchUtils.ts    # HTTP and caching
│   │   ├── xml-utils.ts     # XML downloading/parsing
│   │   └── yaml-utils.ts    # YAML downloading/parsing
│   └── types.ts             # Re-exports all types
└── package.json
```

## Class Hierarchy

```
AbstractCongressApi (base class)
└── Legislators (extends AbstractCongressApi)
    └── CongressApi (extends Legislators)
```

- **AbstractCongressApi**: Raw API calls to Congress.gov, caching, pagination
- **Legislators**: Legislator data management, YAML/XML sources, data merging
- **CongressApi**: High-level API for bills, votes, and legislators combined

## License

MIT
