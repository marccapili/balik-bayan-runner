import { exhibitAsset, exhibitPhoto } from '../data/exhibitPhotos';
import { FICTION_NOTE, KIND_LABEL, type Exhibit } from '../data/exhibits';

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One exhibit as a reading card (used by the in-run panel and the lobby Archive). */
export function exhibitHtml(e: Exhibit): string {
  return `<article class="exhibit" data-kind="${e.kind}">
    <header class="ex-head">
      <div class="ex-icon" aria-hidden="true">${e.icon}</div>
      <div><span class="ex-kind">${esc(KIND_LABEL[e.kind])}</span><h2>${esc(e.title)}</h2><p class="ex-era">${esc(e.era)}</p></div>
    </header>
    ${photoHtml(e)}
    ${e.body.map((p) => `<p class="ex-p">${esc(p)}</p>`).join('')}
    ${e.fact ? `<p class="ex-fact"><b>Alam mo ba?</b> ${esc(e.fact)}</p>` : ''}
    ${e.review ? `<p class="ex-review"><b>⚠️ For verification:</b> ${esc(e.review)}</p>` : ''}
    <div class="ex-sources"><b>Sources</b><ol>${e.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    <p class="ex-fiction">${esc(FICTION_NOTE)}</p>
  </article>`;
}

/** The exhibit's picture with its caption (and credit once known); empty when it has none. */
function photoHtml(e: Exhibit): string {
  const p = exhibitPhoto(e.id);
  if (!p) return '';
  const credit = p.credit ? ` <span class="ex-credit">${esc(p.credit)}</span>` : '';
  return `<figure class="ex-photo"><img src="${exhibitAsset(p.file)}" alt="${esc(p.caption)}" loading="lazy" decoding="async" /><figcaption>${esc(p.caption)}${credit}</figcaption></figure>`;
}
