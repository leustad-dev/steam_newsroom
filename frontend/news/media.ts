export interface PostMedia {
  tag: 'image' | 'video' | 'youtube' | 'media-unavailable';
  src?: string; poster?: string; sources?: string[]; videoId?: string;
}

export function safeMediaUrl(value: string, video = false): string | undefined {
  const expanded = value.trim().replace(/&amp;/gi, '&')
    .replace(/^\{STEAM_CLAN_IMAGE\}/, 'https://clan.akamai.steamstatic.com/images')
    .replace(/^\{STEAM_CLAN_LOC_IMAGE\}/, 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/clans');
  try {
    const url = new URL(expanded);
    const host = url.hostname.toLowerCase();
    const allowed = host.endsWith('.steamstatic.com') || host.endsWith('.steamusercontent.com')
      || ['steamuserimages-a.akamaihd.net', 'steamcdn-a.akamaihd.net'].includes(host);
    if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') return;
    if (/\.svgz?$/i.test(decodeURIComponent(url.pathname))) return;
    if (video && !/\.(mp4|webm)$/i.test(url.pathname)) return;
    return url.href;
  } catch { return; }
}

export function youtubeId(value: string): string | undefined {
  const id = value.trim().replace(/^=/, '').split(';')[0];
  if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
  try {
    const url = new URL(id);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
    const host = url.hostname.toLowerCase();
    const candidate = host === 'youtu.be' ? url.pathname.slice(1)
      : ['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(host)
        ? url.pathname.startsWith('/embed/') ? url.pathname.slice(7) : url.pathname === '/watch' ? url.searchParams.get('v') : undefined
        : undefined;
    return candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : undefined;
  } catch { return; }
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/\b([a-z][a-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]>]+))/gi)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  }
  return result;
}

/** Extract only supported media fields; never forward source attributes or embed HTML. */
export function extractMedia(source: string): { source: string; media: PostMedia[] } {
  const media: PostMedia[] = [];
  const cleaned = source.replace(/\[newsroommedia=[^\]]*\]/gi, '');
  const replaced = cleaned.replace(
    /\[(img|previewyoutube|youtube|video|looping_media)([^\]]*)\]([\s\S]*?)\[\/\1\]|<img\b[^>]*>|<(video|iframe)\b[^>]*>[\s\S]*?<\/\4\s*>/gi,
    (whole: string, bbTag: string | undefined, options: string | undefined, body: string | undefined) => {
      if (media.length >= 24) {
        if (media.length === 24) { media.push({ tag: 'media-unavailable' }); return '[newsroommedia=24]'; }
        return '';
      }
      const tag = bbTag?.toLowerCase() ?? /^<(\w+)/.exec(whole)?.[1].toLowerCase();
      const attrs = attributes(bbTag ? options ?? '' : whole);
      let item: PostMedia = { tag: 'media-unavailable' };
      if (tag === 'img') {
        const src = safeMediaUrl(bbTag ? body?.trim() || attrs.src || '' : attrs.src || '');
        if (src) item = { tag: 'image', src };
      } else if (tag === 'previewyoutube' || tag === 'youtube' || tag === 'iframe') {
        const videoId = youtubeId(tag === 'iframe' ? attrs.src || '' : options?.replace(/^=/, '') || body || '');
        if (videoId) item = { tag: 'youtube', videoId };
      } else {
        const sources = [...new Set([attrs.webm, attrs.mp4, attrs.src, body?.trim(),
          ...[...whole.matchAll(/<source\b[^>]*>/gi)].map(match => attributes(match[0]).src)]
          .filter((value): value is string => Boolean(value)).map(value => safeMediaUrl(value, true)).filter((value): value is string => Boolean(value)))];
        if (sources.length) item = { tag: 'video', sources, poster: attrs.poster ? safeMediaUrl(attrs.poster) : undefined };
      }
      media.push(item);
      return `[newsroommedia=${media.length - 1}]`;
    },
  );
  return { source: replaced, media };
}
