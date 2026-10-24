const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseContent, contentText } = require('../.test-build/news/formatting.js');
const { artworkCandidates, readArtworkUrl } = require('../.test-build/library/artwork.js');
const nodes = tree => tree.children.flatMap(child => typeof child === 'string' ? [] : [child, ...nodes(child)]);

test('AION-style escaped brackets retain literal section labels and account counts', () => {
  const tree = parseContent('[p][b]\\[Restriction Details][/b][/p][p]■ Accounts restricted: \\[12,586][/p]');
  assert.match(contentText(tree), /\[Restriction Details\]/);
  assert.match(contentText(tree), /\[12,586\]/);
  assert.doesNotMatch(contentText(tree), /\\/);
  assert.match(contentText(parseContent('[Restriction Details] [12,586]')), /\[Restriction Details\] \[12,586\]/);
  assert.equal(contentText(parseContent('\\[b]literal\\[/b]')), '[b]literal[/b]');
});

test('Steam BBCode tables retain rows and cells instead of flattening account lists', () => {
  const tree = parseContent('[table equalcells="1" colwidth=",,"][tr][th]Group[/th][th]Count[/th][/tr][tr][td][p]Example***01[/p][/td][td][p]5[/p][/td][/tr][/table]');
  assert.equal(nodes(tree).filter(node => node.tag === 'table').length, 1);
  assert.equal(nodes(tree).filter(node => node.tag === 'tr').length, 2);
  assert.equal(nodes(tree).filter(node => node.tag === 'td').length, 2);
  assert.match(contentText(tree), /Example\*\*\*01\t5\t/);
  assert.doesNotMatch(JSON.stringify(tree), /equalcells|colwidth/);
});

test('HTML tables keep sections and cells but discard source styles and events', () => {
  const tree = parseContent('<table style="position:fixed"><thead><tr><th>A</th></tr></thead><tbody><tr><td onclick="bad()">B</td></tr></tbody></table>');
  assert.equal(nodes(tree).filter(node => node.tag === 'tbody').length, 1);
  assert.equal(nodes(tree).filter(node => node.tag === 'th').length, 1);
  assert.doesNotMatch(JSON.stringify(tree), /onclick|position|bad\(/);
});

test('block source indentation and empty paragraphs do not create large vertical gaps', () => {
  const tree = parseContent('[p]Hello[/p]\n\n[p][/p]\n[p]World\nNext line[/p]\n[p] [/p]');
  assert.equal(tree.children.filter(child => typeof child !== 'string' && child.tag === 'p').length, 2);
  assert.equal(tree.children.filter(child => typeof child === 'string' && !child.trim()).length, 0);
  assert.match(contentText(tree), /World\nNext line/);
  assert.equal(parseContent('[pre]code\n\n\n  indented[/pre]').children[0].children[0], 'code\n\n\n  indented');
});

test('artwork candidates prioritize Steam’s hash-based filename and retain legacy fallbacks', () => {
  const candidates = artworkCandidates('3393110', 'a'.repeat(40) + '/header.jpg');
  assert.equal(candidates[0], 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3393110/' + 'a'.repeat(40) + '/header.jpg');
  assert.ok(candidates.includes('https://cdn.akamai.steamstatic.com/steam/apps/3393110/header.jpg'));
  for (const invalid of ['../secret.jpg', 'https://evil.example/a.jpg', 'header.jpg?x=1', '/file.jpg']) {
    assert.deepEqual(artworkCandidates('570', invalid), artworkCandidates('570'));
  }
  assert.deepEqual(artworkCandidates('../570'), []);
});

test('public artwork metadata accepts modern image URLs only for the requested app', () => {
  const url = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3393110/' + 'a'.repeat(40) + '/header.jpg?t=123';
  const payload = { 3393110: { success: true, data: { header_image: url } } };
  assert.equal(readArtworkUrl(payload, '3393110'), url);
  assert.equal(readArtworkUrl(JSON.stringify(payload), '3393110'), url);
  assert.equal(readArtworkUrl(payload, '570'), undefined);
  for (const value of ['https://evil.example/steam/apps/3393110/header.jpg', 'javascript:bad()', 'https://user@shared.akamai.steamstatic.com/steam/apps/3393110/header.jpg', 'https://shared.akamai.steamstatic.com/steam/apps/570/header.jpg']) {
    assert.equal(readArtworkUrl({ 3393110: { success: true, data: { header_image: value } } }, '3393110'), undefined);
  }
});

const { postDateLabel } = require('../.test-build/news/display.js');
test('feed dates use calendar days rather than a rolling 24-hour cutoff', () => {
  const now = new Date(2026, 9, 23, 0, 1).getTime();
  assert.equal(postDateLabel(new Date(2026, 9, 23, 0, 0).getTime() / 1000, now), 'Today');
  assert.equal(postDateLabel(new Date(2026, 9, 22, 23, 59).getTime() / 1000, now), 'Yesterday');
});
test('relative feed dates retain the seven-day boundary', () => {
  const now = new Date(2026, 9, 23, 12).getTime();
  assert.equal(postDateLabel(new Date(2026, 9, 21, 1).getTime() / 1000, now), '2 days ago');
  assert.equal(postDateLabel(new Date(2026, 9, 16, 23).getTime() / 1000, now), '7 days ago');
});
test('older and future posts have an exact calendar date fallback', () => {
  const now = new Date(2026, 9, 23, 12).getTime();
  for (const date of [new Date(2026, 9, 1), new Date(2026, 9, 25)]) {
    assert.equal(postDateLabel(date.getTime() / 1000, now), date.toLocaleDateString());
  }
});
test('out-of-range source dates have a safe display fallback', () => {
  assert.equal(postDateLabel(Number.MAX_SAFE_INTEGER), 'Date unavailable');
  assert.equal(postDateLabel(Number.NaN), 'Date unavailable');
});
