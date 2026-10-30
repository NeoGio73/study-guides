"""Smoke test for the two flashcard decks. Usage: python3 smoke.py [shots]"""
import json, sys, os, time
from playwright.sync_api import sync_playwright

BASE = '/path/to/study-guides/organic-chemistry/flashcards/'
DECKS = {'ch08': 'ch08-alkenes.html', 'ch09': 'ch09-alkynes.html'}
OUT = '/path/to/study-guides/qa/flashcards/shots'
SHOTS = 'shots' in sys.argv
os.makedirs(OUT, exist_ok=True)

GEOM = r"""
(side) => {
  const card = document.querySelector('#stage .card:not(.leaving)');
  const face = card.querySelector(side==='front'?'.face.front':'.face.back');
  const fr = face.getBoundingClientRect();
  const stage = document.querySelector('#stage').getBoundingClientRect();
  const res = {faceW: fr.width, faceH: fr.height, stageW: stage.width, issues: []};
  if (fr.right > stage.right + 1 || fr.left < stage.left - 1) res.issues.push('face wider than stage');
  const cs = getComputedStyle(face);
  if (cs.visibility === 'hidden' && side === (card.classList.contains('flipped')?'back':'front')) res.issues.push('visible face hidden');
  face.querySelectorAll('.scheme').forEach(s => { if (s.scrollWidth > s.clientWidth + 1) res.issues.push('scheme overflows x by ' + (s.scrollWidth - s.clientWidth)); });
  face.querySelectorAll('figure.mol').forEach(f => {
    const svg = f.querySelector('svg'); const r = svg.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) res.issues.push('svg tiny/invisible ' + f.getAttribute('aria-label'));
    if (r.right > fr.right - 2 || r.left < fr.left + 2 || r.bottom > fr.bottom || r.top < fr.top) res.issues.push('svg outside face ' + f.getAttribute('aria-label'));
    const vb = svg.viewBox.baseVal;
    // check every path stays inside the viewBox (clipping inside svg)
    let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    svg.querySelectorAll('path').forEach(p => { const b = p.getBBox(); minx=Math.min(minx,b.x); miny=Math.min(miny,b.y); maxx=Math.max(maxx,b.x+b.width); maxy=Math.max(maxy,b.y+b.height); });
    if (minx < vb.x - 0.5 || miny < vb.y - 0.5 || maxx > vb.x + vb.width + 0.5 || maxy > vb.y + vb.height + 0.5)
      res.issues.push('svg content clipped ' + f.getAttribute('aria-label') + ` bbox ${minx.toFixed(1)},${miny.toFixed(1)}-${maxx.toFixed(1)},${maxy.toFixed(1)} vb ${vb.width}x${vb.height}`);
    res.mols = (res.mols||[]).concat([[f.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]]);
  });
  // any text overflowing face horizontally
  face.querySelectorAll('.prompt,.answer,.note,.tx,.arr .lbl,figcaption').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > fr.right + 1) res.issues.push('text overflow: ' + e.className); if (e.scrollWidth > e.clientWidth + 2) res.issues.push('text scroll overflow: ' + e.className + ' ' + e.textContent.slice(0,30)); });
  const v = face.querySelector('.viewer canvas'); if (v) { const r = v.getBoundingClientRect(); res.viewer = [Math.round(r.width), Math.round(r.height)]; }
  return res;
}
"""

def run(p, deck, width, reduced=True):
    errors = []
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': width, 'height': 900}, reduced_motion='reduce' if reduced else 'no-preference')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('requestfailed', lambda r: errors.append('reqfail: ' + r.url[:80]))
    page.goto('file://' + BASE + DECKS[deck])
    page.wait_for_timeout(400)
    report = {'deck': deck, 'width': width, 'issues': []}
    sw = page.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
    report['scroll'] = sw
    if sw[0] > sw[1]: report['issues'].append(f'horizontal scroll {sw}')
    total = page.evaluate('DATA.cards.length')
    count = page.inner_text('#count')
    report['count0'] = count
    cards = page.evaluate('DATA.cards.map(c=>c.id)')
    seen = []
    for i in range(total):
        cid = page.evaluate('list[idx].id')
        seen.append(cid)
        g = page.evaluate(GEOM, 'front')
        if SHOTS and width == 1280:
            page.locator('#stage .card:not(.leaving)').screenshot(path=f'{OUT}/{deck}_{cid}_f.png')
        if SHOTS and width == 390:
            page.locator('#stage .card:not(.leaving)').screenshot(path=f'{OUT}/{deck}_{cid}_f_390.png')
        for s in g['issues']: report['issues'].append(f'{cid} front: {s}')
        page.click('#flip'); page.wait_for_timeout(320 if reduced else 750)
        fl = page.evaluate("document.querySelector('#stage .card:not(.leaving)').classList.contains('flipped')")
        if not fl: report['issues'].append(f'{cid}: flip failed')
        g2 = page.evaluate(GEOM, 'back')
        for s in g2['issues']: report['issues'].append(f'{cid} back: {s}')
        # sw after flip
        sw = page.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
        if sw[0] > sw[1]: report['issues'].append(f'{cid} back: horizontal scroll {sw}')
        if SHOTS and width == 1280:
            page.wait_for_timeout(200)
            page.locator('#stage .card:not(.leaving)').screenshot(path=f'{OUT}/{deck}_{cid}_b.png')
        if SHOTS and width == 390:
            page.locator('#stage .card:not(.leaving)').screenshot(path=f'{OUT}/{deck}_{cid}_b_390.png')
        if g2.get('viewer') and g2['viewer'][0] < 50: report['issues'].append(f'{cid}: viewer canvas too small {g2["viewer"]}')
        page.keyboard.press('ArrowRight'); page.wait_for_timeout(60)
    report['seen_all'] = (seen == cards)
    report['end'] = page.inner_text('#stage')[:120]
    report['errors'] = errors
    b.close()
    return report

if __name__ == '__main__':
    with sync_playwright() as p:
        for deck in DECKS:
            for w in (390, 1280):
                r = run(p, deck, w)
                print(json.dumps(r, ensure_ascii=False, indent=1))
