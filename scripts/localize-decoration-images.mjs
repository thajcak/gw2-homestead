import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const publicDir = join(rootDir, 'public');
const assetsDir = join(rootDir, 'src/assets');
const decorationsContentDir = join(rootDir, 'src/content/decorations');

const PLACEHOLDER_URL = 'https://static.staticwars.com/quaggans/lost.jpg';
const CONCURRENCY = 8;
const MAX_ATTEMPTS = 4;

function extensionFromUrl(url) {
  const match = url.match(/\.(png|jpe?g|gif|webp)(?:\?|$)/i);
  if (!match) {
    return url.includes('render.guildwars2.com') ? 'png' : 'jpg';
  }
  return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
}

function isRemoteUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadImage(url, destination, attempt = 1) {
  await mkdir(dirname(destination), { recursive: true });

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

    await writeFile(destination, buffer);
    return createHash('sha256').update(buffer).digest('hex');
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`Failed to download ${url}: ${error.message}`);
    }
    await sleep(attempt * 1000);
    return downloadImage(url, destination, attempt + 1);
  }
}

async function fileHash(path) {
  try {
    const buffer = await readFile(path);
    return createHash('sha256').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

async function localizeDecoration(decoration, options = {}) {
  const { assetsRoot = assetsDir, force = false } = options;
  const id = decoration.id;
  let changed = false;

  if (isRemoteUrl(decoration.icon)) {
    const remoteIcon = decoration.icon;
    const iconRelative = `decorations/${id}/icon.png`;
    const iconAbsolute = join(assetsRoot, iconRelative);
    const existingHash = await fileHash(iconAbsolute);

    if (force || existingHash == null) {
      await downloadImage(remoteIcon, iconAbsolute);
      changed = true;
    }

    decoration.icon = iconRelative;
  }

  const previewSource = decoration.original?.source;
  if (previewSource && decoration.original != null && isRemoteUrl(previewSource)) {
    const remotePreview = previewSource;
    const previewExt = extensionFromUrl(remotePreview);
    const previewRelative = `decorations/${id}/preview.${previewExt}`;
    const previewAbsolute = join(assetsRoot, previewRelative);
    const existingHash = await fileHash(previewAbsolute);
    const storedRemote = decoration.original?.remoteSource;
    const remoteChanged = Boolean(storedRemote && storedRemote !== remotePreview);

    if (force || existingHash == null || remoteChanged) {
      await downloadImage(remotePreview, previewAbsolute);
      changed = true;
    }

    decoration.original = {
      width: decoration.original.width,
      height: decoration.original.height,
      source: previewRelative,
      remoteSource: remotePreview,
    };
  } else if (previewSource && !isRemoteUrl(previewSource)) {
    const previewAbsolute = join(assetsRoot, previewSource);
    const legacyPublicAbsolute = join(publicDir, previewSource);
    const existingHash = await fileHash(previewAbsolute);
    const legacyHash = await fileHash(legacyPublicAbsolute);

    if (existingHash == null && legacyHash != null) {
      await mkdir(dirname(previewAbsolute), { recursive: true });
      const { rename } = await import('node:fs/promises');
      await rename(legacyPublicAbsolute, previewAbsolute);
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

async function localizeArrayFile(arrayFile) {
  const decorations = JSON.parse(await readFile(arrayFile, 'utf8'));
  const localized = await mapWithConcurrency(decorations, CONCURRENCY, async (decoration) => {
    const { decoration: next } = await localizeDecoration(structuredClone(decoration));
    return next;
  });
  await writeFile(arrayFile, `${JSON.stringify(localized, null, 2)}\n`);
  return localized.length;
}

async function localizeContentDirectory(contentDir = decorationsContentDir) {
  const { readdir } = await import('node:fs/promises');
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

async function ensurePlaceholder() {
  const placeholderPath = join(publicDir, 'images/placeholder.png');
  const existing = await fileHash(placeholderPath);
  if (!existing) {
    await downloadImage(PLACEHOLDER_URL, placeholderPath);
  }
}

async function main() {
  const target = process.argv[2];

  await ensurePlaceholder();

  if (!target) {
    const result = await localizeContentDirectory();
    console.log(`Localized images for ${result.total} decorations (${result.updated} updated).`);
    return;
  }

  if (target.endsWith('.json')) {
    const count = await localizeArrayFile(join(rootDir, target));
    console.log(`Localized images for ${count} decorations in ${target}.`);
    return;
  }

  const result = await localizeContentDirectory(join(rootDir, target));
  console.log(`Localized images for ${result.total} decorations (${result.updated} updated).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
