import { extractMedia, type PostMedia } from './media';
export type ContentTag = 'root' | 'p' | 'h2' | 'h3' | 'strong' | 'em' | 'u' | 's' | 'ul' | 'ol' | 'li' | 'blockquote' | 'pre' | 'br' | 'table' | 'tbody' | 'thead' | 'tr' | 'td' | 'th' | PostMedia['tag'];
export interface ContentNode { tag: ContentTag; children: Array<ContentNode | string>; media?: PostMedia }
const aliases: Record<string, ContentTag> = {
  p: 'p', div: 'p', h1: 'h2', h2: 'h2', h3: 'h3', b: 'strong', strong: 'strong', i: 'em', em: 'em',
  u: 'u', strike: 's', s: 's', list: 'ul', ul: 'ul', olist: 'ol', ol: 'ol', li: 'li', '*': 'li',
  quote: 'blockquote', blockquote: 'blockquote', code: 'pre', pre: 'pre', br: 'br', hr: 'br',
  table: 'table', tbody: 'tbody', thead: 'thead', tr: 'tr', td: 'td', th: 'th',
};
function entities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, entity => {
    const names: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
    if (names[entity.toLowerCase()] !== undefined) return names[entity.toLowerCase()];
    const code = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}
/** Build data for React elements with separately validated media; never render source HTML. */
export function parseContent(source: string): ContentNode {
  const escaped = source.slice(0, 200000).replace(/\\([\[\]\\])/g, (_, char: string) =>
    char === '[' ? '&#91;' : char === ']' ? '&#93;' : '&#92;');
  const extracted = extractMedia(escaped
    .replace(/<(script|style|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ''));
  const cleaned = extracted.source.replace(/\{STEAM_CLAN_IMAGE\}\/[^\s<>\[\]]+/gi, '').replace(/\r\n?/g, '\n');
  const root: ContentNode = { tag: 'root', children: [] };
  const stack: ContentNode[] = [root];
  const tokens = cleaned.split(/(\[\/?[a-z*][^\]\n]*\]|<[^>]*>)/gi);
  for (const token of tokens) {
    if (!token) continue;
    const media = /^\[newsroommedia=(\d+)\]$/.exec(token);
    if (media) {
      const item = extracted.media[Number(media[1])];
      if (item) stack[stack.length - 1].children.push({ tag: item.tag, media: item, children: [] });
      continue;
    }
    const match = /^(?:\[(\/)?([a-z0-9*]+)[^\]]*\]|<(\/)?([a-z0-9]+)\b[^>]*>)$/i.exec(token);
    if (!match) { stack[stack.length - 1].children.push(entities(token)); continue; }
    const closing = Boolean(match[1] || match[3]);
    const tag = aliases[(match[2] ?? match[4]).toLowerCase()];
    if (!tag) {
      // Preserve literal bracketed prose, while discarding known formatting wrappers.
      const name = (match[2] ?? match[4]).toLowerCase();
      if (token.startsWith('[') && !['url', 'color', 'size', 'font', 'spoiler', 'noparse', 'strike', 'anchor'].includes(name)) {
        stack[stack.length - 1].children.push(entities(token));
      }
      continue;
    }
    if (closing) {
      const index = stack.map(node => node.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    // Steam's [*] list items usually omit their closing tags.
    if (tag === 'li') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === 'ul' || stack[i].tag === 'ol') { stack.length = i + 1; break; }
      }
    }
    const node: ContentNode = { tag, children: [] };
    stack[stack.length - 1].children.push(node);
    if (tag !== 'br' && stack.length < 32) stack.push(node);
  }
  return normalizeContent(root);
}

const blocks = new Set<ContentTag>(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'image', 'video', 'youtube', 'media-unavailable']);
function normalizeContent(node: ContentNode, inCode = false): ContentNode {
  const code = inCode || node.tag === 'pre';
  const children = node.children.map(child => typeof child === 'string'
    ? code ? child : child.replace(/\n[\t \u00a0]*\n(?:[\t \u00a0]*\n)+/g, '\n\n')
    : normalizeContent(child, code));
  return { ...node, children: children.filter((child, i) => {
    if (code) return true;
    if (typeof child !== 'string') return child.tag !== 'p' || child.children.some(value => typeof value !== 'string' || value.trim());
    const adjacent = (value: ContentNode | string | undefined) => typeof value === 'object' && blocks.has(value.tag);
    // Source newlines between block tags are indentation, not additional paragraphs.
    return child.trim() !== '' || !(adjacent(children[i - 1]) || adjacent(children[i + 1]));
  }) };
}
export function contentText(node: ContentNode): string {
  const block = ['p', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'pre', 'table', 'tr'].includes(node.tag);
  const text = node.children.map(child => typeof child === 'string' ? child : contentText(child)).join('');
  return node.tag === 'br' ? '\n' : node.tag === 'td' || node.tag === 'th' ? `${text.trim()}\t` : node.tag === 'li' ? `\n• ${text}\n` : block ? `\n${text}\n` : text;
}
