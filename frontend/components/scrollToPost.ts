/** Move only our panel: scrollIntoView can also scroll Steam's host containers. */
export function scrollToPost(article: HTMLElement) {
  const panel = article.closest<HTMLElement>('[data-newsroom-scroll]');
  if (!panel) return;
  const offset = article.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientTop;
  panel.scrollTop = Math.max(0, panel.scrollTop + offset - 16);
}
