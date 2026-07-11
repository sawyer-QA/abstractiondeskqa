/* Shared site behavior — AbstractionDeskQA (T-04)
   esc(): merges lookup.html's esc() and sep1-tool.html's escH() into one HTML-escaping
   helper (closes F-18). escH previously did not escape single quotes; this version does
   (escapes & < > " '), matching lookup's post-T-01 behavior — strictly safer, not a
   functional change at any existing call site.

   Tab widgets are kept as two distinct systems, not one generic abstraction, because
   their underlying markup genuinely differs:
     - switchTab: sep1-tool/hbips-tool (.tab-panel/.tab-btn/.active)
     - showTab:   lkw-tool/cmo-tool (.panel/.tab/.on)
   Both are wired via a delegated click listener reading data-tab/data-t instead of
   inline onclick, advancing TD-2. As of T-17, both also carry the same full ARIA
   tablist roving-tabindex/keydown behavior T-10 originally added only to showTab —
   switchTab was brought up to match rather than merged into showTab, since the two
   still key off different class names. See ARCHITECTURE.md §5 / TD-1 / TD-2. */

function esc(s) {
  s = (s === null || s === undefined) ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', function () {
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ── SHARE STRIP COPY-LINK (index, sep1-tool, hbips-tool, lkw-tool, cmo-tool, lookup) ── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.share-copy-btn');
    if (!btn) return;
    navigator.clipboard.writeText('https://abstractiondeskqa.com');
    btn.textContent = 'Copied!';
    setTimeout(function () { btn.textContent = 'Copy link'; }, 2000);
  });

  /* ── switchTab (sep1-tool, hbips-tool) — T-17: roving-tabindex/keydown added, matches T-10's showTab pattern ── */
  var toolTabs = document.querySelector('.tool-tabs-inner');
  if (toolTabs) {
    toolTabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      var id = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      document.querySelectorAll('.tab-btn').forEach(function (b) {
        b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); b.tabIndex = -1;
      });
      document.getElementById('tab-' + id).classList.add('active');
      btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); btn.tabIndex = 0;
    });
    toolTabs.addEventListener('keydown', function (e) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      var tabs = Array.from(this.querySelectorAll('[role="tab"]'));
      var i = tabs.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var next;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else next = tabs[tabs.length - 1];
      next.focus();
      next.click();
    });
  }

  /* ── showTab (lkw-tool, cmo-tool) — preserves T-10's roving-tabindex/keydown exactly ── */
  var tabsInner = document.querySelector('.tabs-inner');
  if (tabsInner) {
    tabsInner.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      var id = btn.dataset.t;
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('on'); });
      document.querySelectorAll('.tab').forEach(function (t) {
        t.classList.remove('on'); t.setAttribute('aria-selected', 'false'); t.tabIndex = -1;
      });
      document.getElementById('tab-' + id).classList.add('on');
      btn.classList.add('on'); btn.setAttribute('aria-selected', 'true'); btn.tabIndex = 0;
    });
    tabsInner.addEventListener('keydown', function (e) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      var tabs = Array.from(this.querySelectorAll('[role="tab"]'));
      var i = tabs.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var next;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else next = tabs[tabs.length - 1];
      next.focus();
      next.click();
    });
  }
});
