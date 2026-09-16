import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = resolve(dirname(scriptPath), '..');
const assets = Object.freeze([
  ['admin.html', 'index.html'],
  ['admin.mjs', 'admin.mjs'],
  ['admin-api.mjs', 'admin-api.mjs'],
  ['admin-translations.mjs', 'admin-translations.mjs'],
  ['admin.css', 'admin.css'],
]);

export async function stageAdminAssets({
  projectRoot = defaultProjectRoot,
  targetRoot,
} = {}) {
  if (!targetRoot) throw new TypeError('targetRoot is required');
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedTargetRoot = resolve(targetRoot);
  const adminRoot = join(resolvedTargetRoot, 'admin');

  await rm(adminRoot, { recursive: true, force: true });
  await mkdir(adminRoot, { recursive: true });
  await Promise.all(assets.map(([source, destination]) => (
    copyFile(join(resolvedProjectRoot, source), join(adminRoot, destination))
  )));

  const files = (await readdir(adminRoot)).sort();
  return { adminRoot, files };
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMainModule) {
  const target = process.argv[2];
  if (!['dist', 'worker-assets'].includes(target)) {
    throw new Error('Target must be dist or worker-assets');
  }
  const result = await stageAdminAssets({ targetRoot: join(defaultProjectRoot, target) });
  console.log(`Staged ${result.files.length} admin assets in ${result.adminRoot}`);
}
