import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const decorationsContentDir = join(rootDir, 'src/content/decorations');
const categoriesContentDir = join(rootDir, 'src/content/categories');
const assetsDecorationsDir = join(rootDir, 'src/assets/decorations');
async function copyIfChanged(source, destination) {
  try {
    const [sourceStat, destinationStat] = await Promise.all([
      stat(source),
      stat(destination).catch(() => null),
    ]);

    if (
      destinationStat &&
      destinationStat.mtimeMs >= sourceStat.mtimeMs &&
      destinationStat.size === sourceStat.size
    ) {
      return;
    }
  } catch {
    return;
  }

  await cp(source, destination);
}

const ENTRY_TYPE_ORDER = [
  'New Item',
  'Item Update',
  'Item Removed',
  'Image Update',
  'Recipe Added',
  'Recipe Updated',
];

function historyToEntry(id, history) {
  return {
    id,
    type: history.type,
    name: history.name,
    ...(history.changes?.length ? { changes: history.changes } : {}),
  };
}

function buildChangelogDays(decorations, categories) {
  const byDay = new Map();

  const addEntries = (id, history = []) => {
    for (const item of history) {
      const dayEntries = byDay.get(item.day) ?? [];
      dayEntries.push(historyToEntry(id, item));
      byDay.set(item.day, dayEntries);
    }
  };

  for (const decoration of decorations) {
    addEntries(decoration.id, decoration.history);
  }

  for (const category of categories) {
    addEntries(category.id, category.history);
  }

  return Array.from(byDay.entries())
    .map(([day, entries]) => ({
      day,
      entries: entries.sort((a, b) => {
        const typeOrder = (type) => ENTRY_TYPE_ORDER.indexOf(type);
        return typeOrder(a.type) - typeOrder(b.type) || a.name.localeCompare(b.name);
      }),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

export async function generateCatalogArtifacts() {
  const catalogDir = join(rootDir, 'public/catalog');
  await mkdir(join(catalogDir, 'decorations'), { recursive: true });
  await mkdir(join(catalogDir, 'icons'), { recursive: true });

  const allDecorations = [];
  const categories = [];

  for (const filename of await readdir(categoriesContentDir)) {
    if (!filename.endsWith('.json')) {
      continue;
    }

    const category = JSON.parse(await readFile(join(categoriesContentDir, filename), 'utf8'));
    categories.push({
      id: category.id,
      name: category.name,
      removed: category.removed ?? false,
      history: category.history ?? [],
    });
  }

  categories.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(
    join(catalogDir, 'categories.json'),
    `${JSON.stringify(categories.map(({ id, name, removed }) => ({ id, name, removed })))}\n`
  );

  const searchIndex = [];

  for (const filename of await readdir(decorationsContentDir)) {
    if (!filename.endsWith('.json')) {
      continue;
    }

    const decoration = JSON.parse(await readFile(join(decorationsContentDir, filename), 'utf8'));
    allDecorations.push(decoration);
    const { history: _history, ...catalogDecoration } = decoration;

    await writeFile(
      join(catalogDir, 'decorations', `${decoration.id}.json`),
      `${JSON.stringify(catalogDecoration)}\n`
    );

    if (!decoration.removed) {
      searchIndex.push({
        id: decoration.id,
        name: decoration.name,
        description: decoration.description,
        categories: decoration.categories,
      });
    }

    const iconSource = join(assetsDecorationsDir, String(decoration.id), 'icon.png');
    const iconDestination = join(catalogDir, 'icons', `${decoration.id}.png`);

    try {
      await stat(iconSource);
      await copyIfChanged(iconSource, iconDestination);
    } catch {
      // Icon assets are optional for individual decorations.
    }
  }

  searchIndex.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(catalogDir, 'search-index.json'), `${JSON.stringify(searchIndex)}\n`);

  const changelogDays = buildChangelogDays(allDecorations, categories);
  await writeFile(join(catalogDir, 'changelog.json'), `${JSON.stringify(changelogDays)}\n`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  await generateCatalogArtifacts();
}
