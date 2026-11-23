/**
 * One-off (A8): convert the stored preview images to the format new downloads use, at most
 * 1,024 px wide WebP, and point each decoration's `original.source` at the new file. Safe to
 * re-run: previews that are already WebP are skipped.
 *
 *   node scripts/shrink-preview-images.mjs
 */
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePreviewImage } from './lib/preview-image.mjs';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const assetsDir = join(rootDir, 'src/assets/decorations');
const contentDir = join(rootDir, 'src/content/decorations');
const CONCURRENCY = 8;

async function convertFolder(id) {
  const folder = join(assetsDir, id);
  const preview = (await readdir(folder)).find((name) => /^preview\.(jpe?g|png|gif)$/i.test(name));
  if (!preview) {
    return null;
  }

  const source = join(folder, preview);
  const before = (await stat(source)).size;
  const { size: after } = await writePreviewImage(source, join(folder, 'preview.webp'));
  await rm(source);

  const contentFile = join(contentDir, `${id}.json`);
  const decoration = JSON.parse(await readFile(contentFile, 'utf8').catch(() => 'null'));
  if (decoration?.original) {
    decoration.original.source = `decorations/${id}/preview.webp`;
    await writeFile(contentFile, `${JSON.stringify(decoration, null, 2)}\n`);
  }

  return { before, after };
}

async function main() {
  const ids = (await readdir(assetsDir)).filter((name) => /^\d+$/.test(name));
  let index = 0;
  let converted = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  async function worker() {
    while (index < ids.length) {
      const result = await convertFolder(ids[index++]);
      if (result) {
        converted += 1;
        bytesBefore += result.before;
        bytesAfter += result.after;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  console.log(`Converted ${converted} previews: ${mb(bytesBefore)} -> ${mb(bytesAfter)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
