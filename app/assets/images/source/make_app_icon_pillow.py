import math, sys
# The app icon (draft 9): Prji's khol texture (red stripes, gold pinstripes, gold leaf vines, navy lotus rings,
# woven gold lacing) lying horizontally on a round navy cushion, royal blue with a soft golden aura. Draft 9 over 8:
# metallic gold, a shadow under the drum, volume on the cushion and the heads, a gloss line, thicker gold lines so
# they survive at 48 px. Writes the SVG to argv[1]; argv[2] == 'text' puts MRIDANGA SEVA on the cushion (splash).
TOP = [(262, 352), (420, 306), (610, 340), (762, 428)]
BOT = [(262, 598), (420, 644), (610, 610), (762, 522)]
RED, RED_D, NAVY, CREAM = '#B3202E', '#8A1522', '#14205C', '#F5E6C4'
GOLD, GOLD_L, GOLD_D = '#E3B04B', '#F6D27A', '#B07A1E'
G = 'url(#gold)'  # metallic gold, light at the top of the picture, deeper at the bottom

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
w('  <!-- Mridanga Seva app icon, draft 9 (03-11-2026, lead chat 22): Prji\'s chosen khol (mail "Photo", 03-11,')
w('       design_reference/prji_logo_khol_upright_03-11.jpg texture) lying horizontally on a round navy cushion,')
w('       no strap, royal blue. Everything inside the central r~330 circle (adaptive-icon safe zone).')
w('       Made by design_reference/make_app_icon_pillow.py; change the drawing there, not here. -->')
w('  <defs>')
w('    <clipPath id="body"><path d="%s"/></clipPath>' % body)
w('    <linearGradient id="round" x1="0" y1="0" x2="0" y2="1">')
w('      <stop offset="0" stop-color="#fff" stop-opacity="0.30"/><stop offset="0.28" stop-color="#fff" stop-opacity="0"/>')
w('      <stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/>')
w('    </linearGradient>')
w('    <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="760">')
w('      <stop offset="0" stop-color="%s"/><stop offset="0.45" stop-color="%s"/><stop offset="1" stop-color="%s"/>' % (GOLD_L, GOLD, GOLD_D))
w('    </linearGradient>')
w('    <radialGradient id="bg" cx="50%" cy="45%" r="62%"><stop offset="0" stop-color="#2848C4"/><stop offset="1" stop-color="#12206E"/></radialGradient>')
w('    <radialGradient id="aura" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFD978" stop-opacity="0.34"/>'
  '<stop offset="0.55" stop-color="#FFD978" stop-opacity="0.12"/><stop offset="1" stop-color="#FFD978" stop-opacity="0"/></radialGradient>')
w('    <linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D2C80"/><stop offset="1" stop-color="#0A123E"/></linearGradient>')
w('    <radialGradient id="seat" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#2A3C9C"/><stop offset="1" stop-color="#16225F"/></radialGradient>')
w('    <radialGradient id="skin" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#FFF6DE"/><stop offset="1" stop-color="#E6D2A6"/></radialGradient>')
w('  </defs>')
w('  <rect width="1024" height="1024" fill="url(#bg)"/>')
w('  <ellipse cx="512" cy="500" rx="360" ry="330" fill="url(#aura)"/>')

# cushion: a round pouf with bulging sides and a curved front, gold piping, scalloped hem, tassels
FRONT = 'M247 590 C222 612 220 668 250 694 Q512 760 774 694 C804 668 802 612 777 590 Z'
w('  <path d="%s" fill="url(#front)" stroke="%s" stroke-width="11" stroke-linejoin="round"/>' % (FRONT, G))
w('  <ellipse cx="512" cy="590" rx="265" ry="36" fill="url(#seat)" stroke="%s" stroke-width="10"/>' % G)
w('  <ellipse cx="520" cy="584" rx="236" ry="24" fill="#050A28" fill-opacity="0.35"/>')  # the drum's shadow
w('  <ellipse cx="520" cy="584" rx="190" ry="15" fill="#050A28" fill-opacity="0.3"/>')
for k in range(19):  # scallops along the hem
    t = (k + 0.5) / 19
    x = (1 - t) ** 2 * 262 + 2 * (1 - t) * t * 512 + t * t * 762
    y = (1 - t) ** 2 * 690 + 2 * (1 - t) * t * 750 + t * t * 690
    w('  <path d="M%.1f %.1f a13 13 0 0 0 26 0" fill="none" stroke="%s" stroke-width="6"/>' % (x - 13, y - 15, G))

def lotus(cx, cy, sc):
    # a simple lotus: 5 broad petals, each outlined in navy so they stay apart when small, on a short base line
    def petal(ang, L, col):
        return ('<path d="M0 0 C-13 -%.1f -13 -%.1f 0 -%.1f C13 -%.1f 13 -%.1f 0 0 Z" fill="%s" stroke="#0A123E" stroke-width="3" transform="rotate(%d)"/>'
                % (L * 0.25, L * 0.65, L, L * 0.65, L * 0.25, col, ang))
    g = ['<g transform="translate(%.1f %.1f) scale(%.2f)">' % (cx, cy, sc)]
    g += [petal(a, 44, '#C8902C') for a in (-64, 64)]
    g += [petal(a, 50, GOLD) for a in (-32, 32)]
    g += [petal(0, 56, GOLD_L), '<path d="M-34 4 Q0 13 34 4" stroke="%s" stroke-width="6" fill="none"/></g>' % GOLD]
    return ''.join(g)
if len(sys.argv) > 2 and sys.argv[2] == 'text':
    w('  <path id="word" d="M300 674 Q512 722 724 674" fill="none"/>')
    w('  <text font-family="Georgia, \'Times New Roman\', serif" font-weight="bold" font-size="40" letter-spacing="3" fill="%s">'
      '<textPath href="#word" startOffset="50%%" text-anchor="middle">MRIDANGA SEVA</textPath></text>' % GOLD_L)
    w('  ' + lotus(282, 672, 0.55) + lotus(742, 672, 0.55))
else:
    w('  ' + lotus(512, 704, 1.0))
    for sgn in (-1, 1):  # a vine running out from the lotus to each side
        w('  <path d="M%d 690 C%d 670 %d 708 %d 680 C%d 660 %d 696 %d 664" fill="none" stroke="%s" stroke-width="7" stroke-linecap="round"/>'
          % (512 + sgn * 58, 512 + sgn * 90, 512 + sgn * 120, 512 + sgn * 150, 512 + sgn * 180, 512 + sgn * 220, 512 + sgn * 250, GOLD))
        for xx, yy in ((512 + sgn * 100, 684), (512 + sgn * 168, 668), (512 + sgn * 232, 672)):
            w('  <ellipse cx="%d" cy="%d" rx="15" ry="6.5" fill="%s" transform="rotate(%d %d %d)"/>' % (xx, yy, GOLD, sgn * -30, xx, yy))
for tx in (232, 792):  # tassels: a knob, a cord and a flared fringe
    w('  <g fill="%s"><circle cx="%d" cy="626" r="10"/><rect x="%d" y="634" width="8" height="14" rx="3"/>'
      '<path d="M%d 648 l-14 60 l36 0 l-14 -60 Z"/></g>' % (G, tx, tx - 4, tx - 4))
    for k in (-10, -3, 4, 11):
        w('  <path d="M%d 656 L%d 706" stroke="%s" stroke-width="2" stroke-opacity="0.6"/>' % (tx, tx + k, GOLD_D))

w('  <g transform="translate(0,-30) rotate(7 262 598)">')  # tilted so the narrow end rests on the cushion too
w('    <path d="%s" fill="%s"/>' % (body, RED))
w('    <g clip-path="url(#body)">')
n = 9  # stripes across the drum, f = 0..1 from the top contour to the bottom one
for i in range(n + 1):
    w('      <path d="%s" fill="none" stroke="%s" stroke-width="5.5"/>' % (d(ctrl(i / n)), GOLD_L))
for i in range(n):
    f = (i + 0.5) / n
    c = ctrl(f)
    if i % 2 == 0:  # gold leaf vine: stem + leaves alternating sides
        a, b = ctrl(f - 0.32 / n), ctrl(f + 0.32 / n)
        w('      <path d="%s L%s C%.1f %.1f %.1f %.1f %.1f %.1f Z" fill="%s"/>' % (d(a), p(b[3]), *b[2], *b[1], *b[0], GOLD))
        w('      <path d="%s" fill="none" stroke="%s" stroke-width="3"/>' % (d(c), RED_D))
        steps = 14
        for s in range(1, steps):
            t = s / steps
            x, y = bez(c, t)
            x2, y2 = bez(c, min(1, t + 0.01))
            ang = math.degrees(math.atan2(y2 - y, x2 - x))
            side = 40 if s % 2 else -40
            wid = (bez(ctrl(min(1, f + 0.5 / n)), t)[1] - bez(ctrl(max(0, f - 0.5 / n)), t)[1])
            L = max(5, wid * 0.46)
            w('      <ellipse cx="0" cy="0" rx="%.1f" ry="%.1f" fill="%s" transform="translate(%.1f %.1f) rotate(%.1f) translate(%.1f 0)"/>'
              % (L * 0.55, L * 0.24, RED_D, x, y, ang + side, L * 0.4))
    else:  # plain red stripe with a thin gold centre line
        w('      <path d="%s" fill="none" stroke="%s" stroke-width="2.5" stroke-opacity="0.85"/>' % (d(c), GOLD))
def ring(x, b):  # control points of a ring's curve at x, bulging b towards the small head
    return [(x, 250), (x + b, 390), (x + b, 560), (x, 700)]
def band(x0, x1, fill, b=50):
    r0, r1 = ring(x0, b), ring(x1, b)
    return '<path d="%s L%s C%.1f %.1f %.1f %.1f %.1f %.1f Z" fill="%s"/>' % (d(r0), p(r1[3]), *r1[2], *r1[1], *r1[0], fill)
def edge(x, b=50, wd=8):
    return '<path d="%s" fill="none" stroke="%s" stroke-width="%d"/>' % (d(ring(x, b)), G, wd)
# woven gold lacing at the big head: crossing diagonals, its right edge curved like the rings
w('      ' + band(200, 336, '#C8902C'))
for k in range(-4, 16):
    y = 330 + k * 24
    w('      <path d="M240 %d L380 %d M240 %d L380 %d" stroke="%s" stroke-width="7"/>' % (y, y + 64, y + 64, y, GOLD_L))
w('      ' + band(339, 393, NAVY) + edge(339) + edge(393))
for k in range(1, 12):
    x, y = bez(ring(366, 50), k / 12)
    w('      <path d="M%.1f %.1f c-9 6 -9 15 0 22 c9 -7 9 -16 0 -22 Z" fill="%s"/>' % (x, y - 11, GOLD))
w('      ' + band(668, 712, NAVY, 34) + edge(668, 34, 7) + edge(712, 34, 7))
for k in range(4, 9):
    x, y = bez(ring(690, 34), k / 12)
    w('      <path d="M%.1f %.1f c-8 5 -8 13 0 19 c8 -6 8 -14 0 -19 Z" fill="%s"/>' % (x, y - 9, GOLD))
w('      <path d="%s" fill="url(#round)"/>' % body)
w('      <path d="%s" fill="none" stroke="#fff" stroke-opacity="0.32" stroke-width="9" stroke-linecap="round"/>' % d(ctrl(0.16)))  # gloss
w('    </g>')
# small head (right) and big head (left): gold rims, cream skin with light from the top left, black syahi
w('    <ellipse cx="764" cy="475" rx="21" ry="52" fill="%s" stroke="%s" stroke-width="5"/>' % (G, NAVY))
w('    <ellipse cx="766" cy="475" rx="12" ry="42" fill="url(#skin)"/>')
w('    <ellipse cx="766" cy="475" rx="5" ry="17" fill="#1C1B2B"/>')
w('    <ellipse cx="262" cy="475" rx="52" ry="124" fill="%s" stroke="%s" stroke-width="5"/>' % (G, NAVY))
w('    <ellipse cx="262" cy="475" rx="45" ry="115" fill="none" stroke="#8A5A0E" stroke-width="7" stroke-dasharray="7 9"/>')
w('    <ellipse cx="258" cy="475" rx="33" ry="98" fill="url(#skin)"/>')
w('    <ellipse cx="258" cy="475" rx="13" ry="40" fill="#1C1B2B"/>')
w('    <ellipse cx="254" cy="458" rx="3.5" ry="11" fill="#fff" fill-opacity="0.35"/>')
w('    <path d="M232 380 C240 366 252 360 262 358" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="6" stroke-linecap="round"/>')
w('  </g>')
w('</svg>')
open(sys.argv[1], 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
