// Where the home ring's circles go and how big the drum circle in the middle may be (components/module-ring.tsx),
// worked out from the size each label really takes (Praveen 15-10-2026: "the icon names are colliding with the inner
// circle — make the circle size dynamic"; docs/DECISIONS.md #369). The circles sit as far out as the ring and the
// screen allow (a side label must stay inside the screen), then the drum circle takes the largest size that keeps
// every label and circle a small gap away, between a minimum and its usual size. Pure, so tests run it.

/** The width and height a label takes on the screen, in pixels. */
export type LabelSize = { width: number; height: number };

/** What the layout needs. */
export type RingInput = {
  /** The ring's square, in pixels (the page's width less its sides, up to a maximum). */
  size: number;
  /** Room on each side of the ring up to the screen's edge (the page's side spacing). */
  side: number;
  /** Diameter of a module's circle. */
  circle: number;
  /** Space between a circle and its label. */
  labelGap: number;
  /** One per module, in ring order (the first at the top, then clockwise). */
  labels: readonly LabelSize[];
  /** The drum circle's usual and smallest diameters. */
  centreMax: number;
  centreMin: number;
};

/** The worked-out ring. */
export type RingLayout = {
  /** Distance from the ring's middle to each circle's middle. */
  radius: number;
  /** The drum circle's diameter. */
  centre: number;
  /** Height the ring needs: down to the lowest label. */
  height: number;
};

/** Space kept between a label or a circle and the drum circle (its 2 px edge included). */
export const CENTRE_GAP = 6;
/** Space kept between a side label and the screen's edge. */
const EDGE_GAP = 4;

/** The angle of module `index` of `count`: the first at the top, then clockwise. */
export function ringAngle(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

/** Distance from the ring's middle (0, 0) to the nearest point of a box. */
function distanceToBox(left: number, top: number, width: number, height: number): number {
  const dx = Math.max(left, 0, -(left + width));
  const dy = Math.max(top, 0, -(top + height));
  return Math.hypot(dx, dy);
}

/** Lays out the ring for the given labels. */
export function ringLayout({ size, side, circle, labelGap, labels, centreMax, centreMin }: RingInput): RingLayout {
  const half = size / 2;
  const count = labels.length;
  // As far out as the square allows for the circles themselves ...
  let radius = half - circle / 2 - 2;
  // ... and as each label's outer end allows: inside the screen.
  labels.forEach((label, index) => {
    const cos = Math.abs(Math.cos(ringAngle(index, count)));
    if (cos > 0.01) radius = Math.min(radius, (half + side - EDGE_GAP - label.width / 2) / cos);
  });
  // The drum circle: as big as the nearest label (under its circle) and the circles leave room for.
  let reach = radius - circle / 2;
  labels.forEach((label, index) => {
    const angle = ringAngle(index, count);
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    reach = Math.min(reach, distanceToBox(x - label.width / 2, y + circle / 2 + labelGap, label.width, label.height));
  });
  const centre = Math.max(centreMin, Math.min(centreMax, 2 * (reach - CENTRE_GAP)));
  // Down to the lowest label.
  const bottom = Math.max(
    ...labels.map((label, index) => half + radius * Math.sin(ringAngle(index, count)) + circle / 2 + labelGap + label.height),
  );
  return { radius, centre: Math.floor(centre), height: Math.ceil(Math.max(size, bottom)) };
}
