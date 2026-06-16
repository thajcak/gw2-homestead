import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const publicDecorationsDir = join(rootDir, 'public/decorations');
const assetsDecorationsDir = join(rootDir, 'src/assets/decorations');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function migratePreviewDirectory(idDir) {
  const id = idDir;
  const publicDir = join(publicDecorationsDir, id);
  const assetsDir = join(assetsDecorationsDir, id);

  let entries;
  try {
    entries = await readdir(publicDir);
  } catch {
    return false;
  }

  const previewFile = entries.find((name) => /^preview\./i.test(name));
  if (!previewFile) {
    return false;
  }

  await mkdir(assetsDir, { recursive: true });
  const sourcePath = join(publicDir, previewFile);
  const targetPath = join(assetsDir, previewFile);

  if (!(await exists(targetPath))) {
    await rename(sourcePath, targetPath);
  }

  return true;
}

async function main() {
  let moved = 0;
  const ids = await readdir(publicDecorationsDir);
  for (const id of ids) {
    if (await migratePreviewDirectory(id)) {
      moved += 1;
    }
  }
  console.log(`Moved ${moved} preview images from public/decorations to src/assets/decorations.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
