const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scrollToPost } = require('../.test-build/components/scrollToPost.js');

test('opening a post scrolls only Newsroom, leaving Steam ancestors and focus alone', () => {
  const steam = { scrollTop: 0 };
  const panel = { scrollTop: 100, clientTop: 2, parentElement: steam, getBoundingClientRect: () => ({ top: 40 }) };
  const article = {
    closest: selector => { assert.equal(selector, '[data-newsroom-scroll]'); return panel; },
    getBoundingClientRect: () => ({ top: 300 }),
    scrollIntoView: () => assert.fail('Must not scroll Steam ancestors'),
    focus: () => assert.fail('Must not change Steam focus'),
  };
  scrollToPost(article);
  assert.equal(panel.scrollTop, 342);
  assert.equal(steam.scrollTop, 0);
});

test('post navigation clamps to the panel top and does nothing outside Newsroom', () => {
  const panel = { scrollTop: 0, clientTop: 0, getBoundingClientRect: () => ({ top: 0 }) };
  scrollToPost({ closest: () => panel, getBoundingClientRect: () => ({ top: 5 }) });
  assert.equal(panel.scrollTop, 0);
  scrollToPost({ closest: () => null, getBoundingClientRect: () => assert.fail('Missing panel') });
});
