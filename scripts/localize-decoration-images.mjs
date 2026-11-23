/**
 * Download remote decoration icons and preview images into src/assets/decorations/{id}/ and
 * point the content files at the local copies.
 *
 * Usage: node scripts/localize-decoration-images.mjs [content-dir]
 *        (default: src/content/decorations)
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRemoteUrl, previewRemovalConfirmed } from './lib/content-store.mjs';
import { writePreviewImage } from './lib/preview-image.mjs';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const assetsDir = join(rootDir, 'src/assets');
const decorationsContentDir = join(rootDir, 'src/content/decorations');

const CONCURRENCY = 8;
const MAX_ATTEMPTS = 4;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch an image, retrying with backoff. Returns its bytes. */
async function fetchImage(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'gw2-homestead-image-sync/1.0' },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error('empty response');
    }

    return buffer;
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`Failed to download ${url}: ${error.message}`);
    }
    await sleep(attempt * 1000);
    return fetchImage(url, attempt + 1);
  }
}

async function downloadImage(url, destination) {
  const buffer = await fetchImage(url);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
}

/** Delete preview.* files in a decoration's asset folder, except `keepFile`. Returns how many. */
async function removePreviewFiles(folder, keepFile = null) {
  let entries;
  try {
    entries = await readdir(folder);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (/^preview\./i.test(entry) && entry !== keepFile) {
      await rm(join(folder, entry), { force: true });
      removed += 1;
    }
  }
  return removed;
}

async function localizeDecoration(decoration) {
  const id = decoration.id;
  let changed = false;

  if (isRemoteUrl(decoration.icon)) {
    // A remote icon only reaches content for a new item or when the API's icon URL changed
    // (see iconFields in content-store.mjs), so the local file is missing or stale.
    const iconRelative = `decorations/${id}/icon.png`;
    await downloadImage(decoration.icon, join(assetsDir, iconRelative));
    decoration.icon = iconRelative;
    changed = true;
  }

  const previewSource = decoration.original?.source;
  const previewFolder = join(assetsDir, 'decorations', String(id));
  if (previewSource && isRemoteUrl(previewSource)) {
    // A remote source only reaches content when wiki enrichment accepted a new or changed
    // image, so always download it: the file on disk is stale or missing by definition.
    // Stored at most 1,024 px wide as WebP: the site never serves it larger (A8).
    const remotePreview = previewSource;
    const previewRelative = `decorations/${id}/preview.webp`;
    const previewAbsolute = join(assetsDir, previewRelative);

    await mkdir(previewFolder, { recursive: true });
    await writePreviewImage(await fetchImage(remotePreview), previewAbsolute);
    // Drop older previews (preview.jpg from before A8, or a different format) so the build's
    // preview glob can't pick them up.
    await removePreviewFiles(previewFolder, basename(previewAbsolute));
    changed = true;

    decoration.original = {
      width: decoration.original.width,
      height: decoration.original.height,
      source: previewRelative,
      remoteSource: remotePreview,
    };
  } else if (!decoration.original && previewRemovalConfirmed(decoration)) {
    // The wiki has had no preview for the whole grace period: drop the file with the metadata.
    if ((await removePreviewFiles(previewFolder)) > 0) {
      changed = true;
    }
  }

  return { decoration, changed };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function localizeContentDirectory(contentDir) {
  const files = (await readdir(contentDir)).filter((file) => file.endsWith('.json'));
  let updated = 0;

  await mapWithConcurrency(files, CONCURRENCY, async (file) => {
    const filePath = join(contentDir, file);
    const decoration = JSON.parse(await readFile(filePath, 'utf8'));
    const { decoration: next, changed } = await localizeDecoration(structuredClone(decoration));
    await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`);
    if (changed) {
      updated += 1;
    }
  });

  return { total: files.length, updated };
}

async function main() {
  const target = process.argv[2];
  const result = await localizeContentDirectory(target ? join(rootDir, target) : decorationsContentDir);
  console.log(`Localized images for ${result.total} decorations (${result.updated} updated).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
