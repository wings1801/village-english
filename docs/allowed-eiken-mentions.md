# Allowed mentions of the exam name

The shipped app (title, manifest, UI, parent screen, built files in `dist/`) must not contain the exam trademark.
Verified by `grep -rniE "eiken|英検" src index.html vite.config.ts pwa.config.ts public dist/index.html dist/manifest.webmanifest`.

Allowed mentions (none of them shipped to the iPad):

- `tests/parent-strings.spec.tsx`, `tests/pwa-config.spec.ts`, `tests/village-domain.spec.ts`: tests that assert the name is absent.
- `docs/` (spec, plan, this file) and `.superpowers/`: internal documentation.
- `content/sources/tatoeba/*.tsv`: third-party sentence data (git-ignored download) that happens to contain the word; not shipped.

The parent screen (Vietnamese) does not mention the exam at all.
