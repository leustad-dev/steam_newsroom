import { createElement, useMemo } from 'react';
import { parseContent, type ContentNode } from '../news/formatting';
import { PostMedia } from './PostMedia';

function renderNode(node: ContentNode, key: number): React.ReactNode {
  if (node.media) return <PostMedia key={key} media={node.media} />;
  const children = node.children.map((child, index) => typeof child === 'string' ? child : renderNode(child, index));
  if (node.tag === 'root') return children;
  if (node.tag === 'table') return <div key={key} className="newsroom-table-scroll"><table>{node.children.some(child => typeof child !== 'string' && ['thead', 'tbody'].includes(child.tag)) ? children : <tbody>{children}</tbody>}</table></div>;
  return createElement(node.tag, { key }, node.tag === 'br' ? undefined : children);
}
export function PostContent({ content }: { content: string }) {
  const rendered = useMemo(() => renderNode(parseContent(content), 0), [content]);
  return <div className="newsroom-post-content" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.7, maxWidth: '960px', margin: '16px 0' }}>
    <style>{`
      .newsroom-post-content h2, .newsroom-post-content h3 { margin: 20px 0 10px; line-height: 1.4; }
      .newsroom-post-content p { margin: 10px 0; }
      .newsroom-post-content p:empty { display: none; }
      .newsroom-table-scroll { max-width: 100%; overflow-x: auto; margin: 12px 0 20px; white-space: normal; }
      .newsroom-table-scroll table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 0.9em; }
      .newsroom-table-scroll td, .newsroom-table-scroll th { border: 1px solid #53616e; padding: 6px 8px; vertical-align: top; overflow-wrap: anywhere; text-align: left; }
      .newsroom-table-scroll td p, .newsroom-table-scroll th p { margin: 0; }
      .newsroom-post-content ul { list-style: disc outside !important; }
      .newsroom-post-content ol { list-style: decimal outside !important; }
      .newsroom-post-content ul, .newsroom-post-content ol { padding-left: 28px; margin: 10px 0; white-space: normal; }
      .newsroom-post-content li { display: list-item; margin: 6px 0; white-space: pre-wrap; }
      .newsroom-post-content blockquote { border-left: 3px solid #60758c; padding-left: 16px; }
      .newsroom-post-content pre { white-space: pre-wrap; padding: 12px; background: #101720; }
    `}</style>
    {rendered}
  </div>;
}
