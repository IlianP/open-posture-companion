/**
 * Fork overlay for the Expo config.
 *
 * app.json stays byte-identical to upstream so upstream merges never
 * conflict there; everything this fork changes about the build is applied
 * on top of it here. Expo evaluates this file wherever it reads the config
 * (prebuild, bundling, `expo start`).
 *
 * See FORK.md for the build and update workflow.
 */

const { execFileSync } = require('node:child_process');

/**
 * Own application id, so this sideloaded build never collides with an
 * official release of the upstream app (a Play Store build is signed with a
 * different key and could not be installed next to — or over — a fork build
 * sharing its id). Changing it later means a fresh install without the
 * stored history.
 */
const ANDROID_PACKAGE = 'io.github.ilianp.openposturecompanion';

/**
 * Template defaults this app has no use for: the overlay permission is a
 * dev-menu leftover, and nothing here reads or writes shared storage.
 */
const BLOCKED_ANDROID_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

function git(...args) {
  try {
    return execFileSync('git', args, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Build identity derived from the commit being built, so the same commit
 * always produces the same numbers whether it is built in CI or locally.
 * versionCode is the commit time in minutes: it only ever grows along main
 * (however a pull request was merged), which is what Android needs to
 * accept a newer APK as an update. Without git the upstream values are
 * kept as they are.
 */
function forkBuild() {
  const seconds = Number.parseInt(git('show', '-s', '--format=%ct', 'HEAD'), 10);
  const commit = git('rev-parse', '--short=7', 'HEAD');
  if (!Number.isInteger(seconds) || seconds <= 0 || !commit) {
    return null;
  }
  return {
    versionCode: Math.floor(seconds / 60),
    // UTC calendar day of the commit, e.g. "20261114".
    date: new Date(seconds * 1000).toISOString().slice(0, 10).replaceAll('-', ''),
    commit,
  };
}

module.exports = ({ config }) => {
  const build = forkBuild();
  return {
    ...config,
    // Shown on the About screen and in Android's app info, so the installed
    // build can be matched to a commit: "1.0.0-fork.20261114+abc1234".
    version: build
      ? `${config.version}-fork.${build.date}+${build.commit}`
      : config.version,
    android: {
      ...config.android,
      package: ANDROID_PACKAGE,
      versionCode: build ? build.versionCode : config.android?.versionCode,
      blockedPermissions: [
        ...(config.android?.blockedPermissions ?? []),
        ...BLOCKED_ANDROID_PERMISSIONS,
      ],
    },
    extra: {
      ...config.extra,
      // Read by the release workflow to name the release.
      forkBuild: build,
    },
  };
};
