import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';
import fs from 'node:fs';
import path from 'node:path';

import {
  parseBillPath,
  parseLegislatorPath,
  isChangelogPath,
  collectRawChanges,
  computeNameTitle,
  getBillTitle,
  countRecordedVotes,
  hasLaws,
  buildChangelogEntry,
  buildMarkdown,
  writeChangelogEntry,
  updateAccumulatedChangelog,
  writePrBody,
  generateChangeSummary,
} from './changelog.js';

import type { ChangelogEntry, RawChange } from './changelog.types.js';

const SITE_BASE = 'https://votedfor.us';
const CWD = '/repo';
const MD_DATA = '/md-data';

function mdOpts(): { dataDir: string; siteBaseUrl: string; fsModule: typeof fs } {
  return { dataDir: MD_DATA, siteBaseUrl: SITE_BASE, fsModule: fs };
}

// ===== HELPERS =====

function emptyEntry(overrides?: Partial<ChangelogEntry>): ChangelogEntry {
  return {
    date: '2026-01-15',
    runId: 'test-run-1',
    legislators: { added: [], updated: [], removed: [] },
    bills: { added: [], updated: [], newLaws: [], withNewVotes: [] },
    ...overrides,
  };
}

/** A noop git runner that always returns '' */
const noGit = (_cmd: string): string => '';

/** Build a readNewFile from an in-memory map */
function makeReadNew(files: Record<string, string>) {
  return (absPath: string): string | null => files[absPath] ?? null;
}

/** Build a readOldGitFile from an in-memory map */
function makeReadOld(files: Record<string, string>) {
  return (repoRelPath: string): string | null => files[repoRelPath] ?? null;
}

// ===== PATH PARSERS =====

describe('parseBillPath', () => {
  test('parses valid bill path', () => {
    const result = parseBillPath('data/bills/119/hr/42.json');
    assert.deepEqual(result, { congress: 119, billType: 'hr', number: '42' });
  });

  test('returns null for non-bill path', () => {
    assert.equal(parseBillPath('data/legislators/A000055.json'), null);
  });

  test('returns null for changelog path', () => {
    assert.equal(parseBillPath('data/changelog/2026-01-01-123.json'), null);
  });

  test('returns null for wrong prefix', () => {
    assert.equal(parseBillPath('content/bills/119/hr/1.json'), null);
  });

  test('handles all bill types', () => {
    for (const t of ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres']) {
      const result = parseBillPath(`data/bills/119/${t}/1.json`);
      assert.ok(result, `should parse ${t}`);
      assert.equal(result?.billType, t);
    }
  });

  test('returns null for non-json file', () => {
    assert.equal(parseBillPath('data/bills/119/hr/1.txt'), null);
  });
});

describe('parseLegislatorPath', () => {
  test('parses valid legislator path', () => {
    assert.equal(parseLegislatorPath('data/legislators/A000055.json'), 'A000055');
  });

  test('returns null for bill path', () => {
    assert.equal(parseLegislatorPath('data/bills/119/hr/1.json'), null);
  });

  test('returns null for wrong prefix', () => {
    assert.equal(parseLegislatorPath('content/legislators/A000055.json'), null);
  });

  test('returns null for non-json file', () => {
    assert.equal(parseLegislatorPath('data/legislators/A000055.txt'), null);
  });
});

describe('isChangelogPath', () => {
  test('recognises per-run changelog file', () => {
    assert.equal(isChangelogPath('data/changelog/2026-01-01-123.json'), true);
  });

  test('recognises accumulated changelog.json', () => {
    assert.equal(isChangelogPath('data/changelog/changelog.json'), true);
  });

  test('returns false for bill path', () => {
    assert.equal(isChangelogPath('data/bills/119/hr/1.json'), false);
  });

  test('returns false for legislator path', () => {
    assert.equal(isChangelogPath('data/legislators/A000055.json'), false);
  });
});

// ===== DATA EXTRACTION HELPERS =====

describe('computeNameTitle', () => {
  test('returns nameTitle if already present (LegislatorSmall format)', () => {
    assert.equal(computeNameTitle({ nameTitle: 'Sen. Jane Doe (CA)' }), 'Sen. Jane Doe (CA)');
  });

  test('builds senator title from full Legislator format', () => {
    const result = computeNameTitle({
      name: { official_full: 'Jane Doe' },
      latest_term: { type: 'sen', state: 'CA' },
    });
    assert.equal(result, 'Sen. Jane Doe (CA)');
  });

  test('builds representative title with district', () => {
    const result = computeNameTitle({
      name: { official_full: 'John Smith' },
      latest_term: { type: 'rep', state: 'TX', district: 5 },
    });
    assert.equal(result, 'Rep. John Smith (TX-5)');
  });

  test('falls back to bioguideId when no name data', () => {
    assert.equal(computeNameTitle({ bioguideId: 'A000055' }), 'A000055');
  });

  test('falls back to bioguide when no name data', () => {
    assert.equal(computeNameTitle({ bioguide: 'B000123' }), 'B000123');
  });

  test('returns Unknown when no identifiable data', () => {
    assert.equal(computeNameTitle({}), 'Unknown');
  });
});

describe('getBillTitle', () => {
  test('returns Short Title when present', () => {
    const title = getBillTitle({
      title: 'Long Title',
      titles: {
        titles: [
          { title: 'The Short Act', titleType: 'Short Title' },
          { title: 'Long Title', titleType: 'Official Title as Introduced' },
        ],
      },
    });
    assert.equal(title, 'The Short Act');
  });

  test('falls back to bill.title when no Short Title', () => {
    assert.equal(getBillTitle({ title: 'The Long Title' }), 'The Long Title');
  });

  test('returns Unknown when no title', () => {
    assert.equal(getBillTitle({}), 'Unknown');
  });
});

describe('countRecordedVotes', () => {
  test('counts recorded votes across all actions', () => {
    const count = countRecordedVotes({
      actions: {
        actions: [
          { recordedVotes: [{ id: 'v1' }, { id: 'v2' }] },
          { recordedVotes: [{ id: 'v3' }] },
          {},
        ],
      },
    });
    assert.equal(count, 3);
  });

  test('returns 0 when no actions', () => {
    assert.equal(countRecordedVotes({}), 0);
  });

  test('returns 0 when actions have no recorded votes', () => {
    assert.equal(countRecordedVotes({ actions: { actions: [{ type: 'IntroReferral' }] } }), 0);
  });
});

describe('hasLaws', () => {
  test('returns true when laws array is non-empty', () => {
    assert.equal(hasLaws({ laws: [{ number: '119-1', type: 'Public Law' }] }), true);
  });

  test('returns false when laws array is empty', () => {
    assert.equal(hasLaws({ laws: [] }), false);
  });

  test('returns false when laws is absent', () => {
    assert.equal(hasLaws({}), false);
  });
});

// ===== buildChangelogEntry =====

describe('buildChangelogEntry', () => {
  const TODAY = '2026-01-15';
  const RUN_ID = 'run-test';

  const legJson = JSON.stringify({
    bioguideId: 'A000055',
    nameTitle: 'Rep. Robert Aderholt (AL-4)',
    state: 'AL',
    party: 'Republican',
    bioguide: 'A000055',
  });

  const billJson = JSON.stringify({
    id: '119-HR-42',
    title: 'Test Bill',
    congress: 119,
    type: 'hr',
    number: '42',
    actions: { actions: [{ recordedVotes: [{ id: 'v1' }] }] },
  });

  const billWithLawJson = JSON.stringify({
    id: '119-HR-1',
    title: 'Law Bill',
    congress: 119,
    type: 'hr',
    number: '1',
    laws: [{ number: '119-1', type: 'Public Law' }],
    actions: { actions: [{ recordedVotes: [{ id: 'v1' }] }] },
  });

  test('processes added legislator', () => {
    const changes: RawChange[] = [{ status: 'A', repoRelativePath: 'data/legislators/A000055.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({ [`${CWD}/data/legislators/A000055.json`]: legJson }),
      makeReadOld({}),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.legislators.added.length, 1);
    assert.equal(entry.legislators.added[0], 'A000055');
    assert.equal(entry.legislators.updated.length, 0);
  });

  test('processes updated legislator', () => {
    const changes: RawChange[] = [{ status: 'M', repoRelativePath: 'data/legislators/A000055.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({ [`${CWD}/data/legislators/A000055.json`]: legJson }),
      makeReadOld({}),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.legislators.updated.length, 1);
    assert.equal(entry.legislators.added.length, 0);
  });

  test('processes removed legislator using old git content', () => {
    const changes: RawChange[] = [{ status: 'D', repoRelativePath: 'data/legislators/A000055.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({}),
      makeReadOld({ 'data/legislators/A000055.json': legJson }),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.legislators.removed.length, 1);
    assert.equal(entry.legislators.removed[0], 'A000055');
  });

  test('skips removed legislator when old content unavailable', () => {
    const changes: RawChange[] = [{ status: 'D', repoRelativePath: 'data/legislators/Z999999.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({}),
      makeReadOld({}),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.legislators.removed.length, 0);
  });

  test('processes added bill', () => {
    const changes: RawChange[] = [{ status: 'A', repoRelativePath: 'data/bills/119/hr/42.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({ [`${CWD}/data/bills/119/hr/42.json`]: billJson }),
      makeReadOld({}),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.bills.added.length, 1);
    assert.equal(entry.bills.added[0], '119-HR-42');
    assert.equal(entry.bills.updated.length, 0);
  });

  test('processes updated bill with no new votes', () => {
    const oldBill = JSON.stringify({
      id: '119-HR-42', title: 'Test Bill', congress: 119, type: 'hr', number: '42',
      actions: { actions: [{ recordedVotes: [{ id: 'v1' }] }] },
    });
    const changes: RawChange[] = [{ status: 'M', repoRelativePath: 'data/bills/119/hr/42.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({ [`${CWD}/data/bills/119/hr/42.json`]: billJson }),
      makeReadOld({ 'data/bills/119/hr/42.json': oldBill }),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.bills.updated.length, 1);
    assert.equal(entry.bills.withNewVotes.length, 0);
  });

  test('detects new recorded votes on updated bill', () => {
    const oldBill = JSON.stringify({
      id: '119-HR-42', title: 'Test Bill', congress: 119, type: 'hr', number: '42',
      actions: { actions: [] },
    });
    const changes: RawChange[] = [{ status: 'M', repoRelativePath: 'data/bills/119/hr/42.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({ [`${CWD}/data/bills/119/hr/42.json`]: billJson }),
      makeReadOld({ 'data/bills/119/hr/42.json': oldBill }),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.bills.updated.length, 1);
    assert.equal(entry.bills.withNewVotes.length, 1);
    assert.equal(entry.bills.withNewVotes[0], '119-HR-42');
  });

  test('detects bill that became law', () => {
    const oldBill = JSON.stringify({
      id: '119-HR-1', title: 'Law Bill', congress: 119, type: 'hr', number: '1',
      actions: { actions: [{ recordedVotes: [{ id: 'v1' }] }] },
    });
    const changes: RawChange[] = [{ status: 'M', repoRelativePath: 'data/bills/119/hr/1.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({ [`${CWD}/data/bills/119/hr/1.json`]: billWithLawJson }),
      makeReadOld({ 'data/bills/119/hr/1.json': oldBill }),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.bills.newLaws.length, 1);
    assert.equal(entry.bills.newLaws[0], '119-HR-1');
  });

  test('does not duplicate law detection when bill was already a law', () => {
    const oldBill = JSON.stringify({
      id: '119-HR-1', laws: [{ number: '119-1', type: 'Public Law' }],
      actions: { actions: [{ recordedVotes: [{ id: 'v1' }] }] },
    });
    const changes: RawChange[] = [{ status: 'M', repoRelativePath: 'data/bills/119/hr/1.json' }];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({ [`${CWD}/data/bills/119/hr/1.json`]: billWithLawJson }),
      makeReadOld({ 'data/bills/119/hr/1.json': oldBill }),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.bills.newLaws.length, 0);
  });

  test('ignores changelog files', () => {
    const changes: RawChange[] = [
      { status: 'A', repoRelativePath: 'data/changelog/2026-01-01-123.json' },
    ];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({}),
      makeReadOld({}),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.bills.added.length, 0);
    assert.equal(entry.legislators.added.length, 0);
  });

  test('ignores unrecognised data files', () => {
    const changes: RawChange[] = [
      { status: 'A', repoRelativePath: 'data/all-legislators.json' },
    ];
    const entry = buildChangelogEntry(
      changes,
      makeReadNew({ [`${CWD}/data/all-legislators.json`]: '[]' }),
      makeReadOld({}),
      TODAY, RUN_ID, CWD, SITE_BASE,
    );
    assert.equal(entry.bills.added.length, 0);
    assert.equal(entry.legislators.added.length, 0);
  });

  test('returns empty entry with correct date/runId when no changes', () => {
    const entry = buildChangelogEntry([], makeReadNew({}), makeReadOld({}), TODAY, RUN_ID, CWD, SITE_BASE);
    assert.equal(entry.date, TODAY);
    assert.equal(entry.runId, RUN_ID);
    assert.equal(entry.legislators.added.length, 0);
    assert.equal(entry.bills.added.length, 0);
  });
});

// ===== buildMarkdown =====

describe('buildMarkdown', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mock({});
  });

  afterEach(() => {
    mock.restore();
    process.chdir(originalCwd);
  });

  test('returns no-changes message for empty entry', () => {
    mock({ [MD_DATA]: {} });
    const md = buildMarkdown(emptyEntry(), mdOpts());
    assert.ok(md.includes('_No content changes detected._'));
  });

  test('renders date in header', () => {
    mock({ [MD_DATA]: {} });
    const md = buildMarkdown(emptyEntry({ date: '2026-03-15' }), mdOpts());
    assert.ok(md.includes('2026-03-15'));
  });

  test('renders New Legislators section with links from data files', () => {
    const legFile = JSON.stringify({
      nameTitle: 'Rep. Aderholt (AL-4)',
      state: 'AL',
      party: 'Republican',
      bioguide: 'A000055',
    });
    mock({ [`${MD_DATA}/legislators/A000055.json`]: legFile });
    const md = buildMarkdown(
      emptyEntry({ legislators: { added: ['A000055'], updated: [], removed: [] } }),
      mdOpts(),
    );
    assert.ok(md.includes('### New Legislators (1)'));
    assert.ok(md.includes('[Rep. Aderholt (AL-4)](https://votedfor.us/legislators/A000055)'));
  });

  test('renders Updated Legislators section', () => {
    const legFile = JSON.stringify({
      name: { official_full: 'Jane Brown' },
      latest_term: { type: 'sen', state: 'OH', party: 'Democrat' },
    });
    mock({ [`${MD_DATA}/legislators/B000123.json`]: legFile });
    const md = buildMarkdown(
      emptyEntry({ legislators: { added: [], updated: ['B000123'], removed: [] } }),
      mdOpts(),
    );
    assert.ok(md.includes('### Updated Legislators (1)'));
    assert.ok(md.includes('[Sen. Jane Brown (OH)]'));
  });

  test('renders Removed Legislators without links', () => {
    const legFile = JSON.stringify({
      nameTitle: 'Rep. Gone (TX-1)',
      state: 'TX',
      party: 'Republican',
    });
    mock({ [`${MD_DATA}/legislators/C000999.json`]: legFile });
    const md = buildMarkdown(
      emptyEntry({ legislators: { added: [], updated: [], removed: ['C000999'] } }),
      mdOpts(),
    );
    assert.ok(md.includes('### Removed Legislators (1)'));
    assert.ok(md.includes('Rep. Gone (TX-1) (C000999)'));
  });

  test('renders Bills That Became Law section', () => {
    const billFile = JSON.stringify({
      id: '119-HR-1',
      title: 'Great Law',
      congress: 119,
      type: 'hr',
      number: '1',
    });
    mock({ [`${MD_DATA}/bills/119/hr/1.json`]: billFile });
    const md = buildMarkdown(
      emptyEntry({ bills: { added: [], updated: [], newLaws: ['119-HR-1'], withNewVotes: [] } }),
      mdOpts(),
    );
    assert.ok(md.includes('### Bills That Became Law (1)'));
    assert.ok(md.includes('[Great Law](https://votedfor.us/bills/119/hr/1)'));
  });

  test('renders Newly Voted-on Bills section', () => {
    const billFile = JSON.stringify({
      id: '119-HR-5',
      title: 'New Bill',
      congress: 119,
      type: 'hr',
      number: '5',
    });
    mock({ [`${MD_DATA}/bills/119/hr/5.json`]: billFile });
    const md = buildMarkdown(
      emptyEntry({ bills: { added: ['119-HR-5'], updated: [], newLaws: [], withNewVotes: [] } }),
      mdOpts(),
    );
    assert.ok(md.includes('### Newly Voted-on Bills (1)'));
    assert.ok(md.includes('[New Bill]'));
  });

  test('truncates Updated Bills to display limit and shows overflow count', () => {
    const tree: Record<string, string> = {};
    for (let i = 0; i < 55; i++) {
      tree[`${MD_DATA}/bills/119/hr/${i}.json`] = JSON.stringify({
        id: `119-HR-${i}`,
        title: `Bill ${i}`,
        congress: 119,
        type: 'hr',
        number: String(i),
      });
    }
    mock(tree);
    const updated = Array.from({ length: 55 }, (_, i) => `119-HR-${i}`);
    const md = buildMarkdown(emptyEntry({ bills: { added: [], updated, newLaws: [], withNewVotes: [] } }), mdOpts());
    assert.ok(md.includes('### Updated Bills (55)'));
    assert.ok(md.includes('*(and 5 more)*'));
  });

  test('truncates Updated Legislators to display limit', () => {
    const tree: Record<string, string> = {};
    for (let i = 0; i < 35; i++) {
      tree[`${MD_DATA}/legislators/L${i}.json`] = JSON.stringify({
        nameTitle: `Rep. L${i}`,
        state: 'CA',
        party: 'Democrat',
      });
    }
    mock(tree);
    const legislators_updated = Array.from({ length: 35 }, (_, i) => `L${i}`);
    const md = buildMarkdown(
      emptyEntry({ legislators: { added: [], updated: legislators_updated, removed: [] } }),
      mdOpts(),
    );
    assert.ok(md.includes('*(and 5 more)*'));
  });

  test('does not show no-changes message when there are changes', () => {
    mock({ [`${MD_DATA}/legislators/X.json`]: JSON.stringify({ nameTitle: 'Rep. X (AA-1)', state: 'AA', party: 'D' }) });
    const md = buildMarkdown(
      emptyEntry({ legislators: { added: ['X'], updated: [], removed: [] } }),
      mdOpts(),
    );
    assert.ok(!md.includes('_No content changes detected._'));
  });
});

// ===== FILE WRITERS =====

describe('writeChangelogEntry', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mock({});
  });

  afterEach(() => {
    mock.restore();
    process.chdir(originalCwd);
  });

  test('writes JSON file to changelog dir', () => {
    const entry = emptyEntry();
    mock({ '/repo/data/changelog': {} });
    const filePath = writeChangelogEntry(entry, '/repo/data/changelog', fs);
    assert.ok(fs.existsSync(filePath));
    const written = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ChangelogEntry;
    assert.equal(written.date, entry.date);
    assert.equal(written.runId, entry.runId);
  });

  test('creates changelog dir if it does not exist', () => {
    const entry = emptyEntry();
    mock({});
    const filePath = writeChangelogEntry(entry, '/new/changelog', fs);
    assert.ok(fs.existsSync('/new/changelog'));
    assert.ok(fs.existsSync(filePath));
  });

  test('filename is {date}-{runId}.json', () => {
    mock({});
    const entry = emptyEntry({ date: '2026-03-01', runId: 'abc123' });
    const filePath = writeChangelogEntry(entry, '/repo/changelog', fs);
    assert.ok(filePath.endsWith('2026-03-01-abc123.json'));
  });
});

describe('updateAccumulatedChangelog', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mock({});
  });

  afterEach(() => {
    mock.restore();
    process.chdir(originalCwd);
  });

  test('creates new file when it does not exist', () => {
    mock({});
    const entry = emptyEntry({ date: '2026-01-01', runId: 'r1' });
    updateAccumulatedChangelog(entry, '/repo/data/changelog.json', fs);
    const content = JSON.parse(fs.readFileSync('/repo/data/changelog.json', 'utf8')) as ChangelogEntry[];
    assert.equal(content.length, 1);
    assert.equal(content[0]?.runId, 'r1');
  });

  test('prepends new entry to existing array', () => {
    const existing: ChangelogEntry[] = [emptyEntry({ runId: 'old' })];
    mock({ '/repo/data/changelog.json': JSON.stringify(existing) });
    const newEntry = emptyEntry({ runId: 'new' });
    updateAccumulatedChangelog(newEntry, '/repo/data/changelog.json', fs);
    const content = JSON.parse(fs.readFileSync('/repo/data/changelog.json', 'utf8')) as ChangelogEntry[];
    assert.equal(content.length, 2);
    assert.equal(content[0]?.runId, 'new');
    assert.equal(content[1]?.runId, 'old');
  });

  test('recovers from corrupt existing file', () => {
    mock({ '/repo/data/changelog.json': 'not valid json' });
    const entry = emptyEntry({ runId: 'fresh' });
    updateAccumulatedChangelog(entry, '/repo/data/changelog.json', fs);
    const content = JSON.parse(fs.readFileSync('/repo/data/changelog.json', 'utf8')) as ChangelogEntry[];
    assert.equal(content.length, 1);
    assert.equal(content[0]?.runId, 'fresh');
  });

  test('creates directory if it does not exist', () => {
    mock({});
    const entry = emptyEntry({ runId: 'r99' });
    updateAccumulatedChangelog(entry, '/brand/new/dir/changelog.json', fs);
    assert.ok(fs.existsSync('/brand/new/dir'));
  });
});

describe('writePrBody', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mock({});
  });

  afterEach(() => {
    mock.restore();
    process.chdir(originalCwd);
  });

  test('writes markdown to pr body path', () => {
    mock({ '/repo/.github': {} });
    writePrBody('## Test\nContent', '/repo/.github/pr-body.md', fs, null);
    const content = fs.readFileSync('/repo/.github/pr-body.md', 'utf8');
    assert.equal(content, '## Test\nContent');
  });

  test('creates directory if it does not exist', () => {
    mock({});
    writePrBody('content', '/new/dir/pr-body.md', fs, null);
    assert.ok(fs.existsSync('/new/dir'));
    assert.ok(fs.existsSync('/new/dir/pr-body.md'));
  });

  test('appends to step summary path when provided', () => {
    mock({ '/github-summary.md': '' });
    writePrBody('## Summary', '/repo/.github/pr-body.md', fs, '/github-summary.md');
    const summary = fs.readFileSync('/github-summary.md', 'utf8');
    assert.ok(summary.includes('## Summary'));
  });

  test('does not write step summary when path not provided', () => {
    const original = process.env['GITHUB_STEP_SUMMARY'];
    delete process.env['GITHUB_STEP_SUMMARY'];
    mock({});
    writePrBody('content', '/repo/.github/pr-body.md', fs, undefined);
    mock.restore();
    if (original) process.env['GITHUB_STEP_SUMMARY'] = original;
  });
});

// ===== collectRawChanges =====

describe('collectRawChanges', () => {
  test('parses git diff name-status output', () => {
    const gitOutput = 'A\tdata/legislators/A000055.json\nM\tdata/bills/119/hr/42.json\nD\tdata/legislators/Z999999.json';
    const changes = collectRawChanges(() => gitOutput);
    assert.equal(changes.length, 3);
    assert.equal(changes[0]?.status, 'A');
    assert.equal(changes[0]?.repoRelativePath, 'data/legislators/A000055.json');
    assert.equal(changes[1]?.status, 'M');
    assert.equal(changes[2]?.status, 'D');
  });

  test('falls back to porcelain format when name-status returns nothing', () => {
    let callCount = 0;
    const gitRunner = (_cmd: string): string => {
      callCount++;
      if (callCount < 3) return '';
      // Simulate porcelain output on third call
      return ' M data/bills/119/hr/1.json\nA  data/legislators/B000001.json';
    };
    const changes = collectRawChanges(gitRunner);
    assert.ok(changes.some(c => c.repoRelativePath === 'data/bills/119/hr/1.json'));
  });

  test('excludes changelog files', () => {
    const gitOutput = 'A\tdata/changelog/2026-01-01-123.json\nA\tdata/legislators/A000055.json';
    const changes = collectRawChanges(() => gitOutput);
    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.repoRelativePath, 'data/legislators/A000055.json');
  });

  test('returns empty array when no changes', () => {
    const changes = collectRawChanges(() => '');
    assert.equal(changes.length, 0);
  });

  test('filters out empty path entries', () => {
    const gitOutput = 'A\tdata/legislators/A000055.json\n\n';
    const changes = collectRawChanges(() => gitOutput);
    assert.equal(changes.length, 1);
  });

  test('normalises Windows backslashes in paths', () => {
    const gitOutput = 'A\tdata\\legislators\\A000055.json';
    const changes = collectRawChanges(() => gitOutput);
    assert.equal(changes[0]?.repoRelativePath, 'data/legislators/A000055.json');
  });
});

// ===== generateChangeSummary (orchestrator) =====

describe('generateChangeSummary', () => {
  let originalCwd: string;

  const legJson = JSON.stringify({
    bioguideId: 'A000055',
    nameTitle: 'Rep. Robert Aderholt (AL-4)',
    state: 'AL',
    party: 'Republican',
    bioguide: 'A000055',
  });

  const billJson = JSON.stringify({
    id: '119-HR-42',
    title: 'Test Bill',
    congress: 119,
    type: 'hr',
    number: '42',
    actions: { actions: [{ recordedVotes: [{ id: 'v1' }] }] },
  });

  beforeEach(() => {
    originalCwd = process.cwd();
    mock({});
  });

  afterEach(() => {
    mock.restore();
    process.chdir(originalCwd);
  });

  test('returns ChangelogEntry with correct shape', () => {
    mock({
      '/test/data/legislators/A000055.json': legJson,
      '/test/data/bills/119/hr/42.json': billJson,
      '/test/.github': {},
    });

    const gitDiff = 'A\tdata/legislators/A000055.json\nA\tdata/bills/119/hr/42.json';
    const entry = generateChangeSummary({
      cwd: '/test',
      dataDir: '/test/data',
      changelogDir: '/test/data/changelog',
      accumulatedPath: '/test/data/changelog.json',
      prBodyPath: '/test/.github/pr-body.md',
      runId: 'test-001',
      today: '2026-02-01',
      siteBaseUrl: 'https://votedfor.us',
      fsModule: fs,
      runGit: () => gitDiff,
      stepSummaryPath: null,
    });

    assert.equal(entry.date, '2026-02-01');
    assert.equal(entry.runId, 'test-001');
    assert.equal(entry.legislators.added.length, 1);
    assert.equal(entry.bills.added.length, 1);
  });

  test('writes per-run changelog JSON file', () => {
    mock({ '/test/data/legislators/A000055.json': legJson });

    generateChangeSummary({
      cwd: '/test',
      dataDir: '/test/data',
      changelogDir: '/test/data/changelog',
      accumulatedPath: '/test/data/changelog.json',
      prBodyPath: '/test/.github/pr-body.md',
      runId: 'run-xyz',
      today: '2026-02-15',
      fsModule: fs,
      runGit: () => 'A\tdata/legislators/A000055.json',
      stepSummaryPath: null,
    });

    const perRunPath = '/test/data/changelog/2026-02-15-run-xyz.json';
    assert.ok(fs.existsSync(perRunPath));
    const written = JSON.parse(fs.readFileSync(perRunPath, 'utf8')) as ChangelogEntry;
    assert.equal(written.runId, 'run-xyz');
  });

  test('writes accumulated changelog.json', () => {
    mock({ '/test/data/legislators/A000055.json': legJson });

    generateChangeSummary({
      cwd: '/test',
      dataDir: '/test/data',
      changelogDir: '/test/data/changelog',
      accumulatedPath: '/test/data/changelog.json',
      prBodyPath: '/test/.github/pr-body.md',
      runId: 'run-aaa',
      today: '2026-02-15',
      fsModule: fs,
      runGit: () => 'A\tdata/legislators/A000055.json',
      stepSummaryPath: null,
    });

    assert.ok(fs.existsSync('/test/data/changelog.json'));
    const accumulated = JSON.parse(fs.readFileSync('/test/data/changelog.json', 'utf8')) as ChangelogEntry[];
    assert.equal(accumulated.length, 1);
  });

  test('writes pr-body.md', () => {
    mock({ '/test/data/legislators/A000055.json': legJson });

    generateChangeSummary({
      cwd: '/test',
      dataDir: '/test/data',
      changelogDir: '/test/data/changelog',
      accumulatedPath: '/test/data/changelog.json',
      prBodyPath: '/test/.github/pr-body.md',
      runId: 'run-bbb',
      today: '2026-02-20',
      fsModule: fs,
      runGit: () => 'A\tdata/legislators/A000055.json',
      stepSummaryPath: null,
    });

    assert.ok(fs.existsSync('/test/.github/pr-body.md'));
    const prBody = fs.readFileSync('/test/.github/pr-body.md', 'utf8');
    assert.ok(prBody.includes('## Congressional Data Update'));
  });

  test('works correctly with no changes', () => {
    mock({});
    const entry = generateChangeSummary({
      cwd: '/test',
      dataDir: '/test/data',
      changelogDir: '/test/data/changelog',
      accumulatedPath: '/test/data/changelog.json',
      prBodyPath: '/test/.github/pr-body.md',
      runId: 'run-empty',
      today: '2026-03-01',
      fsModule: fs,
      runGit: () => '',
      stepSummaryPath: null,
    });
    assert.equal(entry.legislators.added.length, 0);
    assert.equal(entry.bills.added.length, 0);
    const prBody = fs.readFileSync('/test/.github/pr-body.md', 'utf8');
    assert.ok(prBody.includes('_No content changes detected._'));
  });

  test('does not write accumulated changelog when accumulatedPath omitted', () => {
    mock({
      '/test/data/legislators/A000055.json': JSON.stringify({ bioguideId: 'A000055', nameTitle: 'Rep. X' }),
      '/test/.github': {},
    });
    generateChangeSummary({
      cwd: '/test',
      dataDir: '/test/data',
      changelogDir: '/test/data/changelog',
      prBodyPath: '/test/.github/pr-body.md',
      runId: 'run-no-acc',
      today: '2026-04-01',
      fsModule: fs,
      runGit: () => 'A\tdata/legislators/A000055.json',
      stepSummaryPath: null,
    });
    assert.ok(!fs.existsSync('/test/data/changelog.json'));
  });
});
