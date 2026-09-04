import type { RecordAggMode } from './records.js';

export function syncCaptionRecordMode(links: readonly HTMLAnchorElement[], mode: RecordAggMode) {
  links.forEach((link) => {
    const params = new URLSearchParams(link.hash.slice(1));
    if (mode === 'latest') params.set('records', 'latest');
    else params.delete('records');
    link.hash = params.toString();
  });
}

export function bindCaptionLinks(
  links: readonly HTMLAnchorElement[],
  navigate: (hash: string) => void,
) {
  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      // Keep modified clicks and opening/copying links native to the browser.
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(link.hash);
    });
  });
}
