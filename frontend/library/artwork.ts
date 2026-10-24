export function artworkCandidates(appId: string, filename?: unknown): string[] {
  if (!/^[1-9]\d{0,9}$/.test(appId) || Number(appId) > 0xffffffff) return [];
  const files = typeof filename === 'string' && /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(jpg|png|webp|avif)$/i.test(filename)
    ? [filename, 'header.jpg', 'capsule_616x353.jpg'] : ['header.jpg', 'capsule_616x353.jpg'];
  return [...new Set(files.flatMap(file => [
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/${file}`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/${file}`,
  ]))];
}
export function readArtworkUrl(payload: unknown, appId: string): string | undefined {
  const root = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const value = root?.[appId]?.success === true ? root[appId]?.data?.header_image : undefined;
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname.endsWith('.steamstatic.com') && !url.username && !url.password && !url.port
      && url.pathname.includes(`/steam/apps/${appId}/`) && /\.(jpg|png|webp|avif)$/i.test(url.pathname)) return url.href;
  } catch { /* Keep the text fallback. */ }
}
