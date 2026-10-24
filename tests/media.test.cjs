const { test } = require('node:test');
const assert = require('node:assert/strict');
const { safeMediaUrl, youtubeId } = require('../.test-build/news/media.js');
const { parseContent, contentText } = require('../.test-build/news/formatting.js');
const nodes = tree => tree.children.flatMap(child => typeof child === 'string' ? [] : [child, ...nodes(child)]);

test('Steam clan images resolve and retain their position alongside formatted text', () => {
  const tree = parseContent('[h1]Changes[/h1][img]{STEAM_CLAN_IMAGE}/44828248/screenshot.png[/img]After image');
  const image = nodes(tree).find(node => node.tag === 'image');
  assert.equal(image.media.src, 'https://clan.akamai.steamstatic.com/images/44828248/screenshot.png');
  assert.match(contentText(tree), /Changes/);
  assert.doesNotMatch(contentText(tree), /STEAM_CLAN_IMAGE|screenshot\.png/);
  assert.ok(tree.children.findIndex(node => node.tag === 'image') > tree.children.findIndex(node => node.tag === 'h2'));
  assert.ok(safeMediaUrl('{STEAM_CLAN_LOC_IMAGE}/1/a.gif').startsWith('https://cdn.akamai.steamstatic.com/'));
});

test('HTML images and BBCode video sources retain only validated media fields', () => {
  const tree = parseContent('<img src="https://images.steamusercontent.com/a.png" onerror="bad()" style="position:fixed">'
    + '[video mp4="https://video.akamai.steamstatic.com/a.mp4" webm="https://video.akamai.steamstatic.com/a.webm" poster="https://clan.akamai.steamstatic.com/images/p.jpg" autoplay=1 controls=0][/video]');
  const media = nodes(tree).filter(node => node.media).map(node => node.media);
  assert.equal(media[0].tag, 'image');
  assert.equal(media[1].sources.length, 2);
  assert.match(media[1].poster, /p\.jpg$/);
  assert.doesNotMatch(JSON.stringify(media), /onerror|bad\(|position|autoplay|controls/);
});

test('HTML videos, sources and looping media become controlled native videos', () => {
  const tree = parseContent('<video autoplay><source src="https://video.fastly.steamstatic.com/a.webm"><source src="https://video.fastly.steamstatic.com/a.mp4"></video>'
    + '[looping_media src="https://video.fastly.steamstatic.com/b.webm"][/looping_media]');
  const videos = nodes(tree).filter(node => node.tag === 'video');
  assert.equal(videos.length, 2);
  assert.equal(videos[0].media.sources.length, 2);
  assert.equal(videos[1].media.sources[0], 'https://video.fastly.steamstatic.com/b.webm');
});

test('YouTube previews and iframe sources become validated video IDs, never arbitrary embeds', () => {
  const tree = parseContent('[previewyoutube=UUn-ET4vv1s;full][/previewyoutube]<iframe src="https://www.youtube.com/embed/UUn-ET4vv1s" onload="bad()"></iframe>');
  const media = nodes(tree).filter(node => node.media).map(node => node.media);
  assert.equal(media.length, 2);
  media.forEach(item => { assert.equal(item.tag, 'youtube'); assert.equal(item.videoId, 'UUn-ET4vv1s'); });
  assert.doesNotMatch(JSON.stringify(tree), /onload|bad\(/);
  assert.equal(youtubeId('https://youtu.be/UUn-ET4vv1s'), 'UUn-ET4vv1s');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=UUn-ET4vv1s'), 'UUn-ET4vv1s');
  for (const value of ['<script>bad()</script>', 'https://evil.example/embed/UUn-ET4vv1s', 'https://youtube.com.evil.example/watch?v=UUn-ET4vv1s', 'https://user@youtube.com/watch?v=UUn-ET4vv1s']) assert.equal(youtubeId(value), undefined);
});

test('unsafe/non-Steam media URLs cannot reach image, video, or iframe rendering', () => {
  for (const value of ['javascript:bad()', 'data:image/svg+xml,bad', 'file:///tmp/a', 'http://clan.akamai.steamstatic.com/a.png', 'https://steamstatic.com.evil.example/a.png', 'https://evil.example/a.png', 'https://user:pass@clan.akamai.steamstatic.com/a.png', 'https://clan.akamai.steamstatic.com:8080/a.png', 'https://clan.akamai.steamstatic.com/a.svg', 'https://clan.akamai.steamstatic.com/a%2esvg']) assert.equal(safeMediaUrl(value), undefined);
  assert.equal(safeMediaUrl('https://video.fastly.steamstatic.com/a.html', true), undefined);
  const tree = parseContent('[img]javascript:bad()[/img]<iframe src="https://evil.example"></iframe>[video src="https://evil.example/a.mp4"][/video]');
  assert.equal(nodes(tree).filter(node => node.tag === 'media-unavailable').length, 3);
  assert.doesNotMatch(JSON.stringify(tree), /javascript|evil\.example/);
});

test('media parsing is bounded and forged placeholders cannot multiply embeds', () => {
  const tree = parseContent('[newsroommedia=0]'.repeat(100) + '[img]https://clan.akamai.steamstatic.com/a.png[/img]'.repeat(100));
  assert.equal(nodes(tree).filter(node => node.tag === 'image').length, 24);
  assert.equal(nodes(tree).filter(node => node.tag === 'media-unavailable').length, 1);
});
