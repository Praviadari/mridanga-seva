// The parts of scripts/make-icon-font.mjs that tests/icon-font.test.mjs checks too (docs/DECISIONS.md #592).

/** The Ionicons names in icon.tsx's SHAPES (`  home: 'home-outline',`), in their order, each once. */
export function shapesIn(iconSource) {
  const block = /const SHAPES = \{([\s\S]*?)\n\} as const;/.exec(iconSource);
  if (!block) throw new Error('SHAPES not found in src/components/icon.tsx');
  return [...new Set([...block[1].matchAll(/^\s+\w+: '([a-z0-9-]+)',/gm)].map((m) => m[1]))];
}

/** The shapes to keep: each name, and the filled twin of an outline (`-outline` left off) where Ionicons has one. */
export function glyphNames(shapes, glyphMap) {
  const names = new Set();
  for (const name of shapes) {
    names.add(name);
    const filled = name.replace(/-outline$/, '');
    if (filled !== name && filled in glyphMap) names.add(filled);
  }
  return [...names].sort();
}

/** The text of src/components/icon-glyphs.ts. */
export function glyphsSource(names, glyphMap) {
  return [
    '// Written by scripts/make-icon-font.mjs (npm run icons): the character of each shape in assets/fonts/app-icons.ttf,',
    "// the Ionicons shapes the app uses (docs/DECISIONS.md #592). Do not edit; change SHAPES in icon.tsx and run it again.",
    '',
    'export const GLYPHS = {',
    ...names.map((name) => `  '${name}': ${glyphMap[name]},`),
    '} as const;',
    '',
  ].join('\n');
}
