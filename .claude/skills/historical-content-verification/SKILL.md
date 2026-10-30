---
name: historical-content-verification
description: Use when writing or reviewing any historical text, exhibit, archive entry, hero bio or folklore description.
---
# Historical content verification

## When to use
Exhibit panels, archive entries, hero descriptions, loading tips, folklore text.

## Procedure
1. Each entry is data: `{id, title, body, sources: [{title, publisher, url?}], verified: boolean, notes?}` in `data/history.ts`.
2. Prefer: National Historical Commission of the Philippines (nhcp.gov.ph), NCCA (ncca.gov.ph), National Museum of the Philippines, university presses, peer-reviewed work. Encyclopaedias only as secondary.
3. State only what the source supports. No invented quotations, documents, artifacts or source titles.
4. If a claim cannot be verified from an accessible source, set `verified: false` and add a note — the UI shows a "for research" badge; do not present it as fact.
5. Folklore (multo, tikbalang, balete) is labelled **Folklore / Alamat**, never history.
6. Game fiction (time travel, abilities, museum chase) is labelled imaginative fiction in the archive/about screen.

## Standards
- Bodies ≤ 90 words; one key date, one key place, one "why it matters".
- Neutral, respectful tone; no Gen Z slang inside history panels.
- Dates: use the commonly accepted ones (e.g. Battle of Mactan, 27 April 1521) and cite.

## Common failures
- Popular but disputed claims (e.g. famous quotes of uncertain origin) presented as fact.
- Mixing up Rizal's novels' dates or Katipunan founding details — always cite.

## Verify
Every entry has ≥ 1 source; `verified:false` entries render the badge; owner reviews flagged items.
