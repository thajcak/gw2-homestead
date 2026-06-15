import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const decorationsContentDir = join(rootDir, 'src/content/decorations');
const categoriesContentDir = join(rootDir, 'src/content/categories');

export async function generateCatalogArtifacts() {
  const catalogDir = join(rootDir, 'public/catalog');
  await mkdir(join(catalogDir, 'decorations'), { recursive: true });
  await rm(join(catalogDir, 'icons'), { recursive: true, force: true });
  await rm(join(catalogDir, 'changelog.json'), { force: true });

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
    });
  }

  categories.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(catalogDir, 'categories.json'), `${JSON.stringify(categories)}\n`);

  const searchIndex = [];

  for (const filename of await readdir(decorationsContentDir)) {
    if (!filename.endsWith('.json')) {
      continue;
    }

    const decoration = JSON.parse(await readFile(join(decorationsContentDir, filename), 'utf8'));
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
  }

  searchIndex.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(catalogDir, 'search-index.json'), `${JSON.stringify(searchIndex)}\n`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  await generateCatalogArtifacts();
}
