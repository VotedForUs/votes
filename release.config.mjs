import { gitmojis } from 'gitmojis';

const MAJOR_EMOJIS = [':boom:'];
const MINOR_EMOJIS = [':sparkles:', ':new:'];
const EXTRA_PATCH_EMOJIS = [':ballot_box:'];

const reservedEmojis = new Set([...MAJOR_EMOJIS, ...MINOR_EMOJIS]);
const patchEmojis = [
  ...gitmojis.map((g) => g.code).filter((code) => !reservedEmojis.has(code)),
  ...EXTRA_PATCH_EMOJIS,
];

/** @type {import('semantic-release').GlobalConfig} */
export default {
  branches: ['main'],
  plugins: [
    ['semantic-release-gitmoji', {
      releaseRules: {
        major: MAJOR_EMOJIS,
        minor: MINOR_EMOJIS,
        patch: patchEmojis,
      },
    }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    '@semantic-release/npm',
    '@semantic-release/github',
    ['@semantic-release/git', {
      assets: ['CHANGELOG.md', 'package.json'],
      message: '🔖 ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    }],
  ],
}
