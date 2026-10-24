import { DialogButton, Navigation } from 'millennium';
import { useState } from 'react';
import type { PostMedia as Media } from '../news/media';
import { buttonStyle } from './GameTile';

export function PostMedia({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  if (media.tag === 'youtube' && media.videoId) {
    const id = media.videoId;
    return <div style={{ margin: '16px 0', whiteSpace: 'normal' }}>
      {playing ? <iframe title="YouTube video" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
        sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin" style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', border: 0 }} />
        : <DialogButton aria-label="Play YouTube video" style={{
          width: '100%', height: 'auto', minWidth: 0, padding: 0, display: 'block', position: 'relative',
          aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: '6px', background: '#10151c', lineHeight: 1,
        }} onClick={() => setPlaying(true)}>
          {!failed && <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="YouTube video preview" loading="lazy"
            referrerPolicy="no-referrer" onError={() => setFailed(true)}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '16 / 9' }} />}
          <span aria-hidden="true" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            display: 'grid', placeItems: 'center', width: '88px', height: '60px', background: '#c82020', color: 'white', borderRadius: '14px', fontSize: '30px' }}>▶</span>
          <span style={{ position: 'absolute', bottom: '12px', left: '12px', padding: '6px 10px', borderRadius: '4px', background: '#000b', color: 'white', fontSize: '14px' }}>Play on YouTube</span>
        </DialogButton>}
      <DialogButton style={{ ...buttonStyle, marginTop: '8px' }} onClick={() => Navigation.NavigateToExternalWeb(`https://www.youtube.com/watch?v=${id}`)}>Open on YouTube</DialogButton>
    </div>;
  }
  if (failed || media.tag === 'media-unavailable') return <p>Media could not be displayed here. Open the original post to view it.</p>;
  if (media.tag === 'image' && media.src) return <img src={media.src} alt="Announcement image" loading="lazy" referrerPolicy="no-referrer"
    onError={() => setFailed(true)} style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '16px 0' }} />;
  if (media.tag === 'video' && media.sources) return <video controls playsInline preload="none" poster={media.poster}
    onError={() => setFailed(true)} style={{ display: 'block', width: '100%', maxHeight: '70vh', margin: '16px 0' }}>
    {media.sources.map(src => <source key={src} src={src} type={new URL(src).pathname.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'} />)}
  </video>;
  return null;
}
