import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

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
const changelog = JSON.parse(readFileSync(join(root, 'public/changelog.json'), 'utf8'));

writeEntries(
  join(root, 'src/content/decorations'),
  decorations,
  (item) => `${item.id}.json`
);

writeEntries(
  join(root, 'src/content/categories'),
  categories,
  (item) => `${item.id}.json`
);

writeEntries(
  join(root, 'src/content/changelog'),
  changelog.days ?? [],
  (day) => `${day.day}.json`
);

console.log(
  `Split ${decorations.length} decorations, ${categories.length} categories, ${(changelog.days ?? []).length} changelog days.`
);
