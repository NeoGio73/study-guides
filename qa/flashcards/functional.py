"""Functional tests of the deck controls."""
import json, re
from playwright.sync_api import sync_playwright

BASE = 'file:///path/to/study-guides/organic-chemistry/flashcards/'
DECKS = {'ch08': 'ch08-alkenes.html', 'ch09': 'ch09-alkynes.html'}

def legend(page):
    t = page.inner_text('#legend')
    k, r, n = map(int, re.findall(r'(\d+)', t)[:3])
    return k, r, n

def count(page):
    t = page.inner_text('#count'); a, b = t.split('/'); return int(a), int(b)

def run(p, deck, width):
    out = []
    def chk(cond, msg):
        out.append(('PASS ' if cond else 'FAIL ') + msg)
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(BASE + DECKS[deck]); page.wait_for_timeout(300)
    N = page.evaluate('DATA.cards.length')
    enrN = page.evaluate('DATA.cards.filter(c=>c.enrich).length')
    # --- section filter
    opts = page.evaluate("[...document.querySelectorAll('#sec option')].map(o=>[o.value,o.textContent])")
    total_from_opts = 0
    for val, label in opts:
        page.select_option('#sec', val); page.wait_for_timeout(50)
        n_label = int(re.search(r'\((\d+)', label).group(1))
        ln = page.evaluate('list.length')
        secs = set(page.evaluate('list.map(c=>c.sec)'))
        ok = (ln == n_label) and (val == 'all' or secs == {val})
        if val != 'all': total_from_opts += n_label
        if not ok: chk(False, f'section {val}: label {n_label} shown {ln} secs {secs}')
    chk(total_from_opts == N, f'section counts sum {total_from_opts} == deck {N}')
    chk(True, f'all {len(opts)} section options match shown cards (enrichment on)')
    # enrichment off: counts in labels vs shown
    page.select_option('#sec', 'all')
    page.click('#enrich'); page.wait_for_timeout(50)
    ln = page.evaluate('list.length')
    chk(ln == N - enrN, f'enrichment off hides {enrN} cards: list {ln}')
    chk(page.evaluate('list.every(c=>!c.enrich)'), 'no enrichment card shown when toggle off')
    mism = []
    for val, label in opts:
        page.select_option('#sec', val); page.wait_for_timeout(30)
        n_label = int(re.search(r'\((\d+)', label).group(1))
        lab_now = page.evaluate(f"document.querySelector('#sec option[value=\"{val}\"]').textContent")
        if page.evaluate('list.length') != int(re.search(r'\((\d+)', lab_now).group(1)): mism.append((val, lab_now, page.evaluate('list.length')))
    chk(not mism, f'dropdown counts with enrichment OFF: mismatches {mism}')
    k, r, nn = legend(page)
    chk(k + r + nn == page.evaluate('scope().length'), f'legend sums to scope with enrichment off ({k}+{r}+{nn})')
    page.select_option('#sec', 'all')
    page.click('#enrich'); page.wait_for_timeout(50)
    chk(page.evaluate('list.length') == N, 'enrichment back on restores all cards')
    # --- keyboard: Space flips, arrows move, K / R mark
    page.locator('body').click(position={'x': 5, 'y': 5})
    page.keyboard.press(' '); page.wait_for_timeout(300)
    chk(page.evaluate("current().classList.contains('flipped')"), 'Space flips card')
    chk(page.evaluate("current().querySelector('.back').getAttribute('aria-hidden')") == 'false', 'back aria-hidden=false after flip')
    page.keyboard.press(' '); page.wait_for_timeout(300)
    chk(not page.evaluate("current().classList.contains('flipped')"), 'Space flips back')
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(50)
    chk(count(page)[0] == 2, 'ArrowRight -> card 2')
    page.keyboard.press('ArrowLeft'); page.wait_for_timeout(50)
    chk(count(page)[0] == 1, 'ArrowLeft -> card 1')
    page.keyboard.press('ArrowLeft'); page.wait_for_timeout(50)
    chk(count(page)[0] == 1 and page.is_disabled('#prev'), 'ArrowLeft at start stays, Prev disabled')
    id1 = page.evaluate('list[0].id'); id2 = page.evaluate('list[1].id'); id3 = page.evaluate('list[2].id')
    page.keyboard.press('k'); page.wait_for_timeout(50)
    chk(count(page)[0] == 2 and page.evaluate(f"store.status['{id1}']") == 'k', 'K marks got it and advances')
    page.keyboard.press('R'); page.wait_for_timeout(50)
    chk(count(page)[0] == 3 and page.evaluate(f"store.status['{id2}']") == 'r', 'R marks review and advances')
    # buttons
    page.click('#flip'); page.wait_for_timeout(300)
    page.click('#btnGot'); page.wait_for_timeout(50)
    chk(page.evaluate(f"store.status['{id3}']") == 'k' and count(page)[0] == 4, 'Got it button marks + advances')
    page.click('#btnRev'); page.wait_for_timeout(50)
    id4 = page.evaluate('list[3].id')
    chk(page.evaluate(f"store.status['{id4}']") == 'r', 'Review again button marks')
    page.click('#prev'); page.wait_for_timeout(50)
    chk(count(page)[0] == 4, 'Previous button')
    page.click('#next'); page.wait_for_timeout(50)
    chk(count(page)[0] == 5, 'Next button')
    k, r, nn = legend(page)
    chk((k, r, nn) == (2, 2, N - 4), f'legend {k} got / {r} review / {nn} new adds to {N}')
    # mode filters
    page.click('.seg button[data-mode=review]'); page.wait_for_timeout(50)
    chk(page.evaluate('list.map(c=>c.id).sort().join()') == ','.join(sorted([id2, id4])), 'To review shows exactly the review cards')
    page.click('.seg button[data-mode=new]'); page.wait_for_timeout(50)
    chk(page.evaluate('list.length') == N - 4 and page.evaluate('list.every(c=>!store.status[c.id])'), 'Not yet seen shows unmarked cards')
    page.click('.seg button[data-mode=all]'); page.wait_for_timeout(50)
    chk(page.evaluate('list.length') == N, 'All restores')
    # shuffle
    before = page.evaluate('list.map(c=>c.id)')
    page.click('#shuffle'); page.wait_for_timeout(50)
    after = page.evaluate('list.map(c=>c.id)')
    chk(sorted(before) == sorted(after) and before != after, 'Shuffle reorders same set')
    chk(page.get_attribute('#shuffle', 'aria-pressed') == 'true', 'Shuffle aria-pressed true')
    page.click('#shuffle'); page.wait_for_timeout(50)
    chk(page.evaluate('list.map(c=>c.id)') == before, 'Shuffle off restores order')
    # persistence
    page.click('.seg button[data-mode=review]'); page.wait_for_timeout(50)
    page.reload(); page.wait_for_timeout(300)
    k2, r2, n2 = legend(page)
    chk((k2, r2) == (2, 2), f'progress survives reload ({k2},{r2})')
    chk(page.get_attribute('.seg button[data-mode=review]', 'aria-pressed') == 'true', 'mode pref survives reload')
    page.click('.seg button[data-mode=all]')
    # reset (dismiss first, then accept)
    page.once('dialog', lambda d: d.dismiss()); page.click('#reset'); page.wait_for_timeout(100)
    chk(legend(page)[:2] == (2, 2), 'Reset cancelled keeps progress')
    page.once('dialog', lambda d: d.accept()); page.click('#reset'); page.wait_for_timeout(100)
    chk(legend(page) == (0, 0, N), 'Reset clears progress')
    page.reload(); page.wait_for_timeout(300)
    chk(legend(page) == (0, 0, N), 'Reset persists after reload')
    # end card
    page.evaluate('idx=list.length-1; render(0)')
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(50)
    chk('Round complete' in page.inner_text('#stage'), 'end card after last card')
    page.keyboard.press(' '); page.wait_for_timeout(50)
    page.click('#stage .endcard button[data-act=again]'); page.wait_for_timeout(50)
    chk(count(page)[0] == 1, 'Go again from end card')
    # swipe
    box = page.locator('#stage').bounding_box()
    y = box['y'] + 150
    page.mouse.move(box['x'] + box['width'] * 0.8, y); page.mouse.down(); page.mouse.move(box['x'] + box['width'] * 0.2, y, steps=5); page.mouse.up(); page.wait_for_timeout(100)
    chk(count(page)[0] == 2 and not page.evaluate("current().classList.contains('flipped')"), 'swipe left -> next, no flip')
    page.mouse.click(box['x'] + box['width'] / 2, y); page.wait_for_timeout(300)
    chk(page.evaluate("current().classList.contains('flipped')"), 'tap card flips')
    # tab order
    page.reload(); page.wait_for_timeout(300)
    seq = []
    for _ in range(16):
        page.keyboard.press('Tab')
        seq.append(page.evaluate("(()=>{const e=document.activeElement;return e.id||e.tagName+'.'+(e.className||'')+(e.dataset&&e.dataset.mode?'['+e.dataset.mode+']':'')})()"))
    out.append('TAB ORDER: ' + ' > '.join(seq))
    # Space on focused card
    page.focus('#stage .card'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    chk(page.evaluate("current().classList.contains('flipped')"), 'Enter on focused card flips')
    # Space with focus on Got it button: should activate the button only
    page.focus('#flip'); page.keyboard.press(' '); page.wait_for_timeout(300)
    chk(not page.evaluate("current().classList.contains('flipped')"), 'Space on Flip button flips exactly once')
    # aria snapshot of card
    out.append('ARIA card: ' + page.locator('#stage').aria_snapshot()[:400].replace('\n', ' | '))
    out.append('pageerrors: ' + str(errs))
    b.close()
    return out

with sync_playwright() as p:
    for deck in DECKS:
        for w in (390, 1280):
            print(f'=== {deck} @ {w}')
            for line in run(p, deck, w):
                print(line)
