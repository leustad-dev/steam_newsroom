import { DialogBodyText, DialogButton, Navigation } from 'millennium';
import { useEffect, useRef, useState } from 'react';
import { safeNewsUrl, type NewsPost } from '../news/news';
import { PostContent } from './PostContent';
import { scrollToPost } from './scrollToPost';
import { Icon } from './Icon';
import { postDateLabel } from '../news/display';

export function NewsPostView({ post, onOpen, initiallyExpanded = false }: {
  post: NewsPost; onOpen?: () => void; initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    if (initiallyExpanded && !onOpen && article.current) scrollToPost(article.current);
  }, []);
  const url = safeNewsUrl(post.url);
  const date = new Date(post.publishedAt * 1000);
  const dateTime = Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  const exactDate = dateTime ? date.toLocaleString() : 'Date unavailable';
  if (onOpen) return <article className="nr-feed-post">
    <button type="button" className="nr-headline" onClick={onOpen}>
      <time dateTime={dateTime} title={exactDate}>{postDateLabel(post.publishedAt)}</time>
      <span className="nr-headline-title">{post.title}</span>
      <Icon name="chevron" size={12} />
    </button>
  </article>;
  return (
    <article className="nr-post" ref={article}>
      <time className="nr-post-date" dateTime={dateTime}>{exactDate}</time>
      <button type="button" className="nr-post-toggle" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
        <span>{post.title}</span><Icon name="chevron" />
      </button>
      {expanded && (
        <>
          <PostContent content={post.content ?? post.text ?? 'No text is available.'} />
          {post.contentLimited && <DialogBodyText>This unusually long post exceeds the display limit. Open the original for the rest.</DialogBodyText>}
          {url && <DialogButton className="nr-link" onClick={() => Navigation.NavigateToExternalWeb(url)}>
            Open original post <span aria-hidden="true">↗</span>
          </DialogButton>}
        </>
      )}
    </article>
  );
}
