// Scope every selector to this page so Steam's own chrome/layout is untouched.
export const newsroomStyles = `
.steam-newsroom-page {
  --nr-bg: #151e28; --nr-surface: #1e2b39; --nr-border: #304152;
  --nr-text: #edf3f9; --nr-muted: #a4b5c6; --nr-accent: #66c7f5;
  position: relative; box-sizing: border-box; width: 100%; height: 100%; overflow: auto; overscroll-behavior: contain;
  padding: 30px 36px 100px; background: var(--nr-bg); color: var(--nr-text); font-size: 14px; line-height: 1.5;
  container-type: inline-size;
  scrollbar-color: #40566b #151e28; scrollbar-width: thin;
}
.steam-newsroom-page, .steam-newsroom-page * { box-sizing: border-box; user-select: text !important; -webkit-user-select: text !important; }
.steam-newsroom-page button, .steam-newsroom-page button *, .steam-newsroom-page summary, .steam-newsroom-page [role=button], .steam-newsroom-page [role=button] * { user-select: none !important; -webkit-user-select: none !important; }
.steam-newsroom-page h1, .steam-newsroom-page h2, .steam-newsroom-page h3, .steam-newsroom-page p { margin: 0; }
.steam-newsroom-page button.nr-btn, .steam-newsroom-page button.nr-tab, .steam-newsroom-page button.nr-link,
.steam-newsroom-page button.nr-card-open, .steam-newsroom-page button.nr-headline, .steam-newsroom-page button.nr-post-toggle {
  font: inherit !important; letter-spacing: normal !important; text-transform: none !important;
  min-width: 0 !important; min-height: 0 !important; height: auto !important; width: auto;
  border: 1px solid transparent !important; box-shadow: none !important; margin: 0;
  cursor: pointer; transition: background .14s, border-color .14s, color .14s;
}
.steam-newsroom-page button.nr-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: auto !important; padding: 9px 14px !important; border-radius: 6px !important;
  background: #273849 !important; border-color: #3b5063 !important; color: var(--nr-text) !important; line-height: 1.3 !important;
}
.steam-newsroom-page button.nr-btn:hover { background: #334c62 !important; border-color: #658399 !important; }
.steam-newsroom-page button.nr-primary { background: #17669f !important; border-color: #247fba !important; }
.steam-newsroom-page button.nr-primary:hover { background: #227db8 !important; }
.steam-newsroom-page button:disabled { opacity: .45; cursor: default; }
.steam-newsroom-page button:focus-visible, .steam-newsroom-page input:focus-visible, .steam-newsroom-page select:focus-visible,
.steam-newsroom-page summary:focus-visible { outline: 2px solid var(--nr-accent) !important; outline-offset: 3px; }
.steam-newsroom-page .nr-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 22px; }
.steam-newsroom-page .nr-title { font-size: 30px; line-height: 1.2; font-weight: 700; color: #f5f8fc; letter-spacing: -.5px; }
.steam-newsroom-page .nr-subtitle { color: var(--nr-muted); margin-top: 6px; }
.steam-newsroom-page .nr-header-actions { display: flex; align-items: center; gap: 14px; padding-top: 4px; }
.steam-newsroom-page .nr-timer { color: var(--nr-muted); display: inline-flex; align-items: center; gap: 8px; font-size: 13px; white-space: nowrap; }
.steam-newsroom-page .nr-more { position: relative; }
.steam-newsroom-page .nr-more summary { list-style: none; cursor: pointer; padding: 7px 13px; border: 1px solid var(--nr-border); border-radius: 6px; background: #22303e; font-size: 20px; line-height: 1.25; }
.steam-newsroom-page .nr-more summary::-webkit-details-marker { display: none; }
.steam-newsroom-page .nr-more-menu { position: absolute; top: calc(100% + 8px); right: 0; z-index: 10; width: 230px; padding: 8px; border: 1px solid #465c70; border-radius: 8px; background: #22313f; box-shadow: 0 10px 30px #0007; }
.steam-newsroom-page .nr-more-menu button.nr-link { display: block; width: 100% !important; text-align: left; padding: 10px !important; border-radius: 4px; color: var(--nr-text) !important; }
.steam-newsroom-page .nr-tabs { display: flex; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid #37495a; }
.steam-newsroom-page button.nr-tab { padding: 11px 18px !important; background: #22303e !important; color: #c0cfdd !important; border-radius: 5px 5px 0 0 !important; line-height: 1.4 !important; }
.steam-newsroom-page button.nr-tab[aria-pressed=true] { background: #184364 !important; color: #89d8ff !important; border-color: #24658d !important; border-bottom: 3px solid #66c7f5 !important; font-weight: 600 !important; padding-bottom: 9px !important; }
.steam-newsroom-page button.nr-tab:hover { color: #fff !important; background: #2b4052 !important; }
.steam-newsroom-page .nr-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin: 16px 0 20px; }
.steam-newsroom-page .nr-context { flex: 1 1 220px; color: #cedce8; font-size: 14px; }
.steam-newsroom-page .nr-search { position: relative; display: flex; align-items: center; flex: 0 1 320px; min-width: 210px; color: var(--nr-muted); }
.steam-newsroom-page .nr-search > svg { position: absolute; left: 12px; pointer-events: none; }
.steam-newsroom-page .nr-search input { width: 100%; min-width: 0; height: 40px; padding: 8px 40px 8px 38px; background: #21303e; border: 1px solid #384d60; border-radius: 6px; color: var(--nr-text); font: inherit; }
.steam-newsroom-page .nr-search input::placeholder { color: #a4b4c4; opacity: 1; }
.steam-newsroom-page .nr-search-clear { position: absolute; right: 5px; top: 4px; width: 30px; height: 32px; border: 0; border-radius: 4px; background: transparent; color: #b8c8d6; font-size: 22px; cursor: pointer; }
.steam-newsroom-page .nr-search-clear:hover { background: #3b5061; color: white; }
.steam-newsroom-page .nr-sort { display: flex; align-items: center; gap: 8px; color: var(--nr-muted); font-size: 13px; }
.steam-newsroom-page select { height: 40px; max-width: 100%; background: #223241; border: 1px solid #3a4f62; border-radius: 6px; color: var(--nr-text); padding: 8px 28px 8px 12px; font: inherit; color-scheme: dark; cursor: pointer; }
.steam-newsroom-page .nr-status { display: flex; align-items: center; gap: 8px; color: var(--nr-muted); font-size: 13px; }
.steam-newsroom-page .nr-status svg { color: #8dbb65; }
.steam-newsroom-page .nr-status.nr-attention svg { color: #dfb96c; }
.steam-newsroom-page button.nr-link { background: transparent !important; color: var(--nr-accent) !important; padding: 0 !important; display: inline-flex; align-items: center; gap: 7px; line-height: 1.5 !important; text-align: left; white-space: normal; }
.steam-newsroom-page button.nr-link:hover { color: #b4e8ff !important; background: #ffffff07 !important; }
.steam-newsroom-page .nr-grid { display: grid; gap: 22px; align-items: stretch; }
.steam-newsroom-page .nr-news-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.steam-newsroom-page .nr-library-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.steam-newsroom-page .nr-game-card { min-width: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--nr-border); border-radius: 7px; background: var(--nr-surface); transition: border-color .14s, background .14s; }
.steam-newsroom-page .nr-game-card:hover { border-color: #53738c; background: #233344; }
.steam-newsroom-page button.nr-card-open { display: block; width: 100% !important; padding: 0 !important; background: transparent !important; color: var(--nr-text) !important; text-align: left; white-space: normal; border-radius: 0 !important; }
.steam-newsroom-page button.nr-card-open:hover { color: #fff !important; background: #ffffff04 !important; }
.steam-newsroom-page .nr-card-title { padding: 12px 15px 4px; font-size: 16px; line-height: 1.35; font-weight: 650; overflow-wrap: anywhere; }
.steam-newsroom-page .nr-card-body { padding: 0 15px 14px; display: flex; flex: 1; flex-direction: column; }
.steam-newsroom-page .nr-game-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; color: var(--nr-muted); font-size: 12px; line-height: 1.5; margin-bottom: 6px; }
.steam-newsroom-page .nr-library-grid .nr-card-title { min-height: 3.45em; }
.steam-newsroom-page .nr-library-grid .nr-game-meta { margin-top: auto; margin-bottom: 0; }
.steam-newsroom-page .nr-news-grid .nr-card-open img { aspect-ratio: 5 / 2 !important; }
.steam-newsroom-page .nr-feed-post { margin: 0; border-top: 1px solid #354757; }
.steam-newsroom-page button.nr-headline { display: grid; grid-template-columns: 66px minmax(0, 1fr) 12px; gap: 10px; align-items: center; width: 100% !important; min-height: 44px !important; padding: 8px 12px !important; text-align: left; white-space: normal; line-height: 1.5 !important; background: transparent !important; color: #dce8f2 !important; border-radius: 6px !important; }
.steam-newsroom-page button.nr-headline:hover { color: #fff !important; background: #ffffff06 !important; }
.steam-newsroom-page .nr-headline time { color: var(--nr-muted); font-size: 11px; }
.steam-newsroom-page .nr-headline-title { overflow-wrap: anywhere; font-size: 13px; }
.steam-newsroom-page .nr-headline svg { color: #a7bccd; }
.steam-newsroom-page .nr-history-link { margin-top: auto; border-top: 1px solid #354757; padding-top: 10px; }
.steam-newsroom-page .nr-notice { padding: 12px 16px; margin: 12px 0; border: 1px solid #465465; border-radius: 7px; color: #d4e0ea; background: #23313e; }
.steam-newsroom-page .nr-notice.nr-warning { border-color: #75603f; background: #352f25; }
.steam-newsroom-page .nr-empty { text-align: center; padding: 60px 20px; color: var(--nr-muted); border: 1px dashed #3b5266; border-radius: 8px; }
.steam-newsroom-page .nr-failures { padding: 18px; border: 1px solid #665638; border-radius: 8px; background: #262d31; margin-bottom: 20px; }
.steam-newsroom-page .nr-failures h2 { font-size: 16px; margin-bottom: 12px; }
.steam-newsroom-page .nr-failure { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 8px 0; border-bottom: 1px solid #3b4348; }
.steam-newsroom-page .nr-failure p { color: var(--nr-muted); }
.steam-newsroom-page .nr-pagination { display: flex; gap: 18px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 28px; color: var(--nr-muted); font-size: 13px; }
.steam-newsroom-page .nr-detail { max-width: 1200px; margin: 22px auto 0; }
.steam-newsroom-page .nr-detail-header { display: flex; align-items: center; flex-wrap: wrap; gap: 24px; margin: 18px 0 22px; padding-bottom: 22px; border-bottom: 1px solid var(--nr-border); }
.steam-newsroom-page .nr-detail-art { width: 300px; max-width: 100%; overflow: hidden; border-radius: 7px; border: 1px solid var(--nr-border); }
.steam-newsroom-page .nr-detail-info { flex: 1; min-width: 200px; }
.steam-newsroom-page .nr-detail-info h2 { font-size: 26px; line-height: 1.25; margin-bottom: 10px; }
.steam-newsroom-page .nr-detail-info h2 button.nr-link { padding: 4px 12px !important; border-radius: 6px !important; }
.steam-newsroom-page .nr-detail-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; margin-bottom: 20px; }
.steam-newsroom-page .nr-detail-hint { color: var(--nr-muted); font-size: 12px; }
.steam-newsroom-page .nr-post { border: 1px solid var(--nr-border); background: #1b2733; border-radius: 8px; padding: 20px 24px; margin: 14px 0; scroll-margin-top: 16px; }
.steam-newsroom-page .nr-post-date { display: block; color: var(--nr-muted); font-size: 12px; margin-bottom: 6px; }
.steam-newsroom-page button.nr-post-toggle { display: flex; align-items: center; justify-content: space-between; gap: 20px; width: 100% !important; min-height: 44px !important; padding: 8px 12px !important; border-radius: 6px !important; color: var(--nr-text) !important; background: transparent !important; white-space: normal; text-align: left; font-size: 18px !important; font-weight: 600 !important; line-height: 1.45 !important; }
.steam-newsroom-page button.nr-post-toggle:hover { color: var(--nr-accent) !important; background: #ffffff06 !important; }
.steam-newsroom-page .nr-post-toggle svg { flex-shrink: 0; transition: transform .14s; }
.steam-newsroom-page .nr-post-toggle[aria-expanded=true] svg { transform: rotate(90deg); }
.steam-newsroom-page .newsroom-post-content { color: #c7d5e1; font-size: 15px; }
.steam-newsroom-page .nr-game-card { position: relative; }
.steam-newsroom-page button.nr-favorite-control { position: absolute; top: 10px; right: 10px; z-index: 1; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid #75899b; border-radius: 8px; background: #101a26e8; color: #91a1ae; font-size: 23px; line-height: 1; cursor: pointer; }
.steam-newsroom-page button.nr-favorite-control:hover { color: #ffe393; background: #304251; }
.steam-newsroom-page button.nr-favorite-control[aria-pressed=true] { color: #ffd36a; opacity: 1; }
.steam-newsroom-page button.nr-favorite-control:disabled { cursor: default; }
.steam-newsroom-page button.nr-favorite-remove { color: #ff777d; border-color: #a45159; background: #351c25ed; font-size: 29px; }
.steam-newsroom-page button.nr-favorite-remove:hover { color: #fff; background: #a73847; }
.steam-newsroom-page button.nr-favorite-control:active { transform: scale(.9); }
.steam-newsroom-page .nr-favorite-pop { position: absolute; z-index: 8; pointer-events: none; display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid #ffd36a; border-radius: 50%; background: #493c20e8; color: #ffe393; font-size: 26px; line-height: 1; box-shadow: 0 0 16px #ffd36a55; animation: nr-favorite-pop 420ms ease-out both; }
.steam-newsroom-page .nr-favorite-pop-remove { color: #ff9399; border-color: #ff777d; background: #49202ce8; box-shadow: 0 0 16px #ff777d55; }
@keyframes nr-favorite-pop { 0% { opacity: 1; transform: translate(-50%, -50%) scale(.7); } 35% { opacity: 1; transform: translate(-50%, -75%) scale(1.3); } 100% { opacity: 0; transform: translate(-50%, -140%) scale(1); } }
@keyframes nr-favorite-fade { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .steam-newsroom-page .nr-favorite-pop { transform: translate(-50%, -50%); animation: nr-favorite-fade 200ms ease-out both; } .steam-newsroom-page button.nr-favorite-control:active { transform: none; } }
.steam-newsroom-page button.nr-ignore-control { position: absolute; top: 10px; left: 10px; z-index: 1; padding: 7px 10px; border: 1px solid #75899b; border-radius: 7px; background: #101a26e8; color: #cedce8; font: inherit; font-size: 12px; cursor: pointer; }
.steam-newsroom-page button.nr-ignore-control:hover:not(:disabled) { background: #70363d; border-color: #dc777e; color: white; }
.steam-newsroom-page button.nr-ignore-control:disabled { opacity: .6; cursor: not-allowed; }
.steam-newsroom-page .nr-ignored-list { max-width: 900px; margin: 24px auto; }
.steam-newsroom-page .nr-ignored-list h2 { margin-bottom: 8px; }
.steam-newsroom-page .nr-ignored-list ul { list-style: none; padding: 0; margin: 20px 0; }
.steam-newsroom-page .nr-ignored-list li { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 16px; border-bottom: 1px solid var(--nr-border); }
.steam-newsroom-page .nr-ignored-list button { padding: 8px 14px; background: #273e51; color: var(--nr-text); border: 1px solid #405c72; border-radius: 6px; font: inherit; cursor: pointer; }
.steam-newsroom-page .nr-favorite-search { margin: 20px 0; padding: 18px; border: 1px solid var(--nr-border); border-radius: 8px; background: #1b2733; }
.steam-newsroom-page .nr-favorite-search label { display: block; margin-bottom: 8px; font-weight: 600; }
.steam-newsroom-page .nr-favorite-search-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; max-width: 700px; }
.steam-newsroom-page .nr-favorite-search input { flex: 1; min-width: 160px; background: #121d28; color: var(--nr-text); border: 1px solid #40566b; border-radius: 6px; padding: 10px 12px; font: inherit; }
.steam-newsroom-page .nr-favorite-search button { background: #273e51; color: var(--nr-text); border: 1px solid #405c72; border-radius: 6px; padding: 8px 14px; font: inherit; cursor: pointer; }
.steam-newsroom-page .nr-favorite-search button:disabled { opacity: .55; cursor: default; }
.steam-newsroom-page .nr-favorite-autocomplete { position: relative; max-width: 700px; }
.steam-newsroom-page .nr-favorite-dropdown { position: absolute; top: calc(100% - 4px); left: 0; right: 0; z-index: 5; max-height: 320px; overflow-y: auto; overscroll-behavior: contain; background: #22313f; border: 1px solid #465c70; border-radius: 6px; box-shadow: 0 10px 24px #0006; }
.steam-newsroom-page .nr-favorite-dropdown > p { padding: 12px; color: var(--nr-muted); }
.steam-newsroom-page .nr-favorite-results { list-style: none; margin: 0; padding: 4px; }
.steam-newsroom-page .nr-favorite-results li { margin: 0; padding: 0; }
.steam-newsroom-page .nr-favorite-results button { display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; border: 0; padding: 10px 12px; text-align: left; background: transparent; }
.steam-newsroom-page .nr-favorite-results button:hover, .steam-newsroom-page .nr-favorite-results button[aria-selected=true] { background: #33516a; }
.steam-newsroom-page .nr-favorite-results button span { overflow-wrap: anywhere; }
.steam-newsroom-page .nr-favorite-results .nr-detail-hint { flex-shrink: 0; }
@container (max-width: 1400px) { .steam-newsroom-page .nr-news-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .steam-newsroom-page .nr-library-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
@container (max-width: 1100px) { .steam-newsroom-page .nr-news-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .steam-newsroom-page .nr-library-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .steam-newsroom-page .nr-status { flex-basis: 100%; } }
@container (max-width: 850px) { .steam-newsroom-page .nr-library-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .steam-newsroom-page .nr-context { flex-basis: 100%; } }
@container (max-width: 600px) { .steam-newsroom-page .nr-news-grid { grid-template-columns: 1fr; } .steam-newsroom-page .nr-library-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .steam-newsroom-page .nr-search { flex: 1 1 220px; } }
@media (max-width: 700px) { .steam-newsroom-page { padding: 22px 18px 100px; } .steam-newsroom-page .nr-header { flex-direction: column; gap: 14px; } .steam-newsroom-page .nr-title { font-size: 26px; } .steam-newsroom-page .nr-post { padding: 16px; } }
@container (max-width: 360px) { .steam-newsroom-page .nr-library-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .steam-newsroom-page * { transition: none !important; } }
`;
