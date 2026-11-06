# Content sources (download and convert)

Raw downloads go into `content/sources/` (git-ignored), one NEW empty directory per source. They are untrusted
data: parse only, never execute anything from them, run Python with `-I`. Downloaded on 2026-11-06.

| Source | Version / file | Licence | Credit |
| --- | --- | --- | --- |
| CEFR-J Wordlist | Version 1.6, https://www.cefr-j.org/data/CEFRJ_wordlist_ver1.6.zip (page: https://www.cefr-j.org/download.html), 1.09 MB | Free use with citation | 『CEFR-J Wordlist Version 1.6』東京外国語大学投野由紀夫研究室 |
| Tatoeba | https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2 (35 MB), `.../jpn/jpn_sentences_detailed.tsv.bz2` (4.5 MB), `.../eng/eng-jpn_links.tsv.bz2` (1.4 MB) | CC BY 2.0 FR; author per sentence | Author names on the Credits page |
| JMdict (jmdict-simplified) | 3.6.2+20261102210542, `jmdict-eng-common-3.6.2+20261102210542.json.tgz` from https://github.com/scriptin/jmdict-simplified/releases (1.4 MB) | CC BY-SA 4.0 | EDRDG |

The Tatoeba downloads page uses template placeholders, so the `per_language` paths were verified with HTTP HEAD.
The all-language `links.tar.bz2` is about 150 MB; the small per-language eng-jpn links file is used instead.

## Steps

1. `content/sources/cefrj/`: unzip the zip, then
   `python -I scripts/xlsx_to_tsv.py "content/sources/cefrj/CEFR-J Wordlist Ver1.6.xlsx" ALL content/sources/cefrj/all.tsv`
2. `content/sources/tatoeba/`: `bzip2 -dk` each file and rename to `eng.tsv`, `jpn.tsv`, `links.tsv`.
3. `content/sources/jmdict/`: `tar xzf` the tgz, giving `jmdict-eng-common-3.6.2.json`.
4. `npm run import-words`, then `npm run import-tatoeba`, then `npm run gen-credits`.

Grade split lives in `content/grade-map.json` (levels per grade and `limits`).

## About the Japanese hints

`ja` in `content/work/words-*.json` is an unverified dictionary hint; `jaLookup: 'clean'` only means the lookup was
structurally unambiguous, NOT that the meaning is right for a child. Authors must write the child-facing Japanese
meaning themselves. `review-ja-<grade>.json` lists the `doubtful` lookups.
