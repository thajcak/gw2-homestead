import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function writeEntries(dir, items, getFilename) {
  mkdirSync(dir, { recursive: true });
  for (const item of items) {
    const filename = getFilename(item);
    writeFileSync(join(dir, filename), `${JSON.stringify(item, null, 2)}\n`);
  }
}

const decorations = JSON.parse(
  readFileSync(join(root, 'public/decorations.json'), 'utf8')
);
const categories = JSON.parse(
  readFileSync(join(root, 'public/decoration_categories.json'), 'utf8')
);

writeEntries(
  join(root, 'src/content/decorations'),
  decorations.map((item) => ({ ...item, history: item.history ?? [] })),
  (item) => `${item.id}.json`
);

writeEntries(
  join(root, 'src/content/categories'),
  categories.map((item) => ({ ...item, history: item.history ?? [] })),
  (item) => `${item.id}.json`
);

console.log(`Split ${decorations.length} decorations and ${categories.length} categories.`);
