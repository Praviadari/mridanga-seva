import math, sys
# Draft 3 of the app icon: Prji's upright khol texture (red stripes, gold pinstripes, gold leaf vines, navy lotus
# band, woven gold lacing at the big head) laid horizontally on the navy cushion. Writes the SVG to argv[1].
TOP = [(262, 352), (420, 306), (610, 340), (762, 428)]
BOT = [(262, 598), (420, 644), (610, 610), (762, 522)]
RED, RED_D, GOLD, GOLD_L, NAVY, CREAM = '#B3202E', '#8A1522', '#E3B04B', '#F6D27A', '#14205C', '#F5E6C4'

def lerp(a, b, f): return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
def ctrl(f): return [lerp(TOP[i], BOT[i], f) for i in range(4)]
def bez(c, t):
    u = 1 - t
    return tuple(u**3 * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t**3 * c[3][k] for k in range(2))
def d(c): return 'M%.1f %.1f C%.1f %.1f %.1f %.1f %.1f %.1f' % (*c[0], *c[1], *c[2], *c[3])
def p(pt): return '%.1f %.1f' % pt

body = d(TOP) + ' L%s C%.1f %.1f %.1f %.1f %.1f %.1f Z' % (p(BOT[3]), *BOT[2], *BOT[1], *BOT[0])
out = []
w = out.append
w('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">')
w('  <!-- Mridanga Seva app icon, draft 8 (03-11-2026, lead chat 22): Prji\'s chosen khol (mail "Photo", 03-11,')
w('       design_reference/prji_logo_khol_upright_03-11.jpg texture) lying horizontally on a round navy cushion,')
w('       no strap, royal blue. No words. Everything inside the central r~330 circle (adaptive-icon safe zone).')
w('       Made by design_reference/make_app_icon_pillow.py; change the drawing there, not here. -->')
w('  <defs>')
w('    <clipPath id="body"><path d="%s"/></clipPath>' % body)
w('    <linearGradient id="round" x1="0" y1="0" x2="0" y2="1">')
w('      <stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.3" stop-color="#fff" stop-opacity="0"/>')
w('      <stop offset="0.62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.42"/>')
w('    </linearGradient>')
w('    <radialGradient id="bg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#2440B8"/><stop offset="1" stop-color="#14247A"/></radialGradient>')
w('  </defs>')
w('  <rect width="1024" height="1024" fill="url(#bg)"/>')

# cushion: a round pouf with bulging sides and a curved front, gold piping, scalloped hem, tassels, and on the
# front either the words MRIDANGA SEVA (argv[2] == 'text') or a lotus-and-vine ornament
FRONT = 'M247 590 C222 612 220 668 250 694 Q512 760 774 694 C804 668 802 612 777 590 Z'
w('  <path d="%s" fill="#101A4E" stroke="%s" stroke-width="9" stroke-linejoin="round"/>' % (FRONT, GOLD))
w('  <ellipse cx="512" cy="590" rx="265" ry="36" fill="#18256B" stroke="%s" stroke-width="8"/>' % GOLD)
w('  <path id="hem" d="M262 690 Q512 750 762 690" fill="none"/>')
for k in range(23):  # scallops along the hem
    t = (k + 0.5) / 23
    x = (1 - t) ** 2 * 262 + 2 * (1 - t) * t * 512 + t * t * 762
    y = (1 - t) ** 2 * 690 + 2 * (1 - t) * t * 750 + t * t * 690
    w('  <path d="M%.1f %.1f a11 11 0 0 0 22 0" fill="none" stroke="%s" stroke-width="4"/>' % (x - 11, y - 14, GOLD))
LOTUS = ('<g fill="%s" transform="translate(%%.1f %%.1f) scale(%%.2f)"><path d="M0 0 C-14 -14 -16 -32 0 -50 C16 -32 14 -14 0 0 Z"/>'
         '<path d="M0 0 C-22 -4 -38 -18 -42 -38 C-20 -34 -6 -20 0 0 Z"/><path d="M0 0 C22 -4 38 -18 42 -38 C20 -34 6 -20 0 0 Z"/>'
         '<path d="M-30 4 Q0 12 30 4" stroke="%s" stroke-width="5" fill="none"/></g>') % (GOLD, GOLD)
def lotus(cx, cy, sc):
    # a simple lotus: 5 broad petals, each outlined in navy so they stay apart when small, on a short base line
    def petal(ang, L, col):
        return ('<path d="M0 0 C-13 -%.1f -13 -%.1f 0 -%.1f C13 -%.1f 13 -%.1f 0 0 Z" fill="%s" transform="rotate(%d)"/>'
                % (L * 0.25, L * 0.65, L, L * 0.65, L * 0.25, col, ang)).replace('/>', ' stroke="#101A4E" stroke-width="3"/>')
    g = ['<g transform="translate(%.1f %.1f) scale(%.2f)">' % (cx, cy, sc)]
    g += [petal(a, 44, '#C8902C') for a in (-64, 64)]
    g += [petal(a, 50, GOLD) for a in (-32, 32)]
    g += [petal(0, 56, GOLD_L),
          '<path d="M-34 4 Q0 13 34 4" stroke="%s" stroke-width="5" fill="none"/></g>' % GOLD]
    return ''.join(g)
if len(sys.argv) > 2 and sys.argv[2] == 'text':
    w('  <path id="word" d="M300 674 Q512 722 724 674" fill="none"/>')
    w('  <text font-family="Georgia, \'Times New Roman\', serif" font-weight="bold" font-size="40" letter-spacing="3" fill="%s">'
      '<textPath href="#word" startOffset="50%%" text-anchor="middle">MRIDANGA SEVA</textPath></text>' % GOLD_L)
    w('  ' + lotus(282, 672, 0.55) + lotus(742, 672, 0.55))
else:
    w('  ' + lotus(512, 704, 0.95))
    for sgn in (-1, 1):  # a vine running out from the lotus to each side
        w('  <path d="M%d 690 C%d 670 %d 708 %d 680 C%d 660 %d 696 %d 664" fill="none" stroke="%s" stroke-width="5" stroke-linecap="round"/>'
          % (512 + sgn * 56, 512 + sgn * 90, 512 + sgn * 120, 512 + sgn * 150, 512 + sgn * 180, 512 + sgn * 220, 512 + sgn * 250, GOLD))
        for xx, yy in ((512 + sgn * 100, 684), (512 + sgn * 168, 668), (512 + sgn * 232, 672)):
            w('  <ellipse cx="%d" cy="%d" rx="12" ry="5" fill="%s" transform="rotate(%d %d %d)"/>' % (xx, yy, GOLD, sgn * -30, xx, yy))
w('  <g fill="%s">' % GOLD)
w('    <path d="M232 622 l-10 30 l6 0 l-10 56 l28 0 l-10 -56 l6 0 Z"/>')
w('    <path d="M792 622 l-10 30 l6 0 l-10 56 l28 0 l-10 -56 l6 0 Z"/>')
w('  </g>')

w('  <g transform="translate(0,-30) rotate(7 262 598)">')  # tilted so the narrow end rests on the cushion too
w('    <path d="%s" fill="%s"/>' % (body, RED))
w('    <g clip-path="url(#body)">')
# stripes: pattern across the drum, f = 0..1 from top contour to bottom contour
n = 9
for i in range(n + 1):
    f = i / n
    w('      <path d="%s" fill="none" stroke="%s" stroke-width="4"/>' % (d(ctrl(f)), GOLD_L))
for i in range(n):
    f = (i + 0.5) / n
    c = ctrl(f)
    if i % 2 == 0:  # gold leaf vine: stem + leaves alternating sides
        a, b = ctrl(f - 0.32 / n), ctrl(f + 0.32 / n)
        w('      <path d="%s L%s C%.1f %.1f %.1f %.1f %.1f %.1f Z" fill="%s"/>' % (d(a), p(b[3]), *b[2], *b[1], *b[0], GOLD))
        w('      <path d="%s" fill="none" stroke="%s" stroke-width="2.5"/>' % (d(c), RED_D))
        steps = 16
        for s in range(1, steps):
            t = s / steps
            x, y = bez(c, t)
            x2, y2 = bez(c, min(1, t + 0.01))
            ang = math.degrees(math.atan2(y2 - y, x2 - x))
            side = 40 if s % 2 else -40
            # leaf size follows the stripe width, which narrows towards the small head
            wid = (bez(ctrl(min(1, f + 0.5 / n)), t)[1] - bez(ctrl(max(0, f - 0.5 / n)), t)[1])
            L = max(4, wid * 0.42)
            w('      <ellipse cx="0" cy="0" rx="%.1f" ry="%.1f" fill="%s" transform="translate(%.1f %.1f) rotate(%.1f) translate(%.1f 0)"/>'
              % (L * 0.55, L * 0.22, RED_D, x, y, ang + side, L * 0.4))
    else:  # plain red stripe with a thin gold centre line
        w('      <path d="%s" fill="none" stroke="%s" stroke-width="2" stroke-opacity="0.8"/>' % (d(c), GOLD))
# navy lotus band near the big head, and a thinner one near the small head: rings round the barrel, so curved
def ring(x, b):  # control points of a ring's curve at x, bulging b towards the small head
    return [(x, 250), (x + b, 390), (x + b, 560), (x, 700)]
def band(x0, x1, fill, b=50):
    r0, r1 = ring(x0, b), ring(x1, b)
    return '<path d="%s L%s C%.1f %.1f %.1f %.1f %.1f %.1f Z" fill="%s"/>' % (d(r0), p(r1[3]), *r1[2], *r1[1], *r1[0], fill)
def edge(x, b=50, wd=6):
    return '<path d="%s" fill="none" stroke="%s" stroke-width="%d"/>' % (d(ring(x, b)), GOLD, wd)
# woven gold lacing at the big head: crossing diagonals, its right edge curved like the rings
w('      ' + band(200, 336, '#C8902C'))
for k in range(-4, 16):
    y = 330 + k * 24
    w('      <path d="M240 %d L380 %d M240 %d L380 %d" stroke="%s" stroke-width="6"/>' % (y, y + 64, y + 64, y, GOLD_L))
w('      ' + band(339, 393, NAVY) + edge(339) + edge(393))
for k in range(1, 12):
    x, y = bez(ring(366, 50), k / 12)
    w('      <path d="M%.1f %.1f c-8 6 -8 14 0 20 c8 -6 8 -14 0 -20 Z" fill="%s"/>' % (x, y - 10, GOLD))
w('      ' + band(668, 712, NAVY, 34) + edge(668, 34, 6) + edge(712, 34, 6))
for k in range(4, 9):  # the small band's lotus marks, only where the narrowing body shows them
    x, y = bez(ring(690, 34), k / 12)
    w('      <path d="M%.1f %.1f c-7 5 -7 12 0 17 c7 -5 7 -12 0 -17 Z" fill="%s"/>' % (x, y - 8, GOLD))
w('      <path d="%s" fill="url(#round)"/>' % body)
w('    </g>')
# small head (right), edge-on; big head (left), turned a little towards us
w('    <ellipse cx="764" cy="475" rx="21" ry="52" fill="%s" stroke="%s" stroke-width="5"/>' % (GOLD, NAVY))
w('    <ellipse cx="766" cy="475" rx="12" ry="42" fill="%s"/>' % CREAM)
w('    <ellipse cx="766" cy="475" rx="5" ry="17" fill="#1C1B2B"/>')  # the small head's syahi
w('    <ellipse cx="262" cy="475" rx="52" ry="124" fill="%s" stroke="%s" stroke-width="5"/>' % (GOLD, NAVY))
w('    <ellipse cx="262" cy="475" rx="45" ry="115" fill="none" stroke="#9A6A12" stroke-width="7" stroke-dasharray="7 9"/>')
w('    <ellipse cx="258" cy="475" rx="33" ry="98" fill="%s"/>' % CREAM)
w('    <ellipse cx="258" cy="475" rx="13" ry="40" fill="#1C1B2B"/>')
w('  </g>')
w('</svg>')
open(sys.argv[1], 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
