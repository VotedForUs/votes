/** @type {import('semantic-release').GlobalConfig} */
export default {
  branches: ['main'],
  plugins: [
    ['semantic-release-gitmoji', {
      releaseRules: {
        major: [':boom:'],
        minor: [':sparkles:'],
        patch: [':bug:', ':ambulance:', ':lock:', ':wrench:', ':recycle:', ':arrow_up:'],
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
