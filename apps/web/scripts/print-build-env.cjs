// TEMPORARY deploy diagnostic - safe to delete once the Render build is green.
//
// The Render dashboard overrides render.yaml, so the blueprint is not a reliable
// record of how the build actually runs. The web build reproduces clean on
// Windows and on Linux (node 22 and 24, fresh `npm ci`, no .env files, with and
// without a non-standard NODE_ENV), so whatever breaks it lives in Render's
// environment. This prints the parts that could still differ.
const os = require('os');

const resolved = (name) => {
  try {
    return require.resolve(name);
  } catch {
    return '<unresolved>';
  }
};
const versionOf = (name) => {
  try {
    return require(name + '/package.json').version;
  } catch {
    return '<unresolved>';
  }
};

console.log(
  '[build-env] ' +
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
        totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
        cpus: os.cpus().length,
        NODE_ENV: process.env.NODE_ENV ?? null,
        NODE_OPTIONS: process.env.NODE_OPTIONS ?? null,
        NODE_VERSION: process.env.NODE_VERSION ?? null,
        CI: process.env.CI ?? null,
        npm_config_production: process.env.npm_config_production ?? null,
        next: versionOf('next'),
        react: versionOf('react'),
        reactDom: versionOf('react-dom'),
        // Two resolution roots here means duplicate copies, which is exactly how
        // the HtmlContext identity check fails.
        reactFrom: resolved('react'),
        nextFrom: resolved('next'),
      },
      null,
      2,
    ),
);
