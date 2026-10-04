/**
 * electron-builder omits node_modules from extraResources; the Nest API needs them.
 * @param {import('builder-util').AfterPackContext} context
 */
module.exports = async function afterPack(context) {
  const { cpSync, existsSync } = require('node:fs');
  const { join } = require('node:path');

  const repoRoot = join(__dirname, '..');
  const src = join(repoRoot, 'dist/electron-app/node_modules');
  const dest = join(context.appOutDir, 'resources', 'karaokej-server', 'node_modules');

  if (!existsSync(src)) {
    throw new Error(`Missing staged node_modules at ${src}. Run scripts/stage-electron-app.sh first.`);
  }

  cpSync(src, dest, { recursive: true, dereference: true });
};
