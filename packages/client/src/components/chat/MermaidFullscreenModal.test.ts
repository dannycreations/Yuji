import { describe, expect, test } from 'bun:test';

import { zoomAtAnchor } from '@yuji/client/components/chat/MermaidFullscreenModal';

// A content point sits at content coordinates `c` and renders at
// `position + c * scale` on screen.
const toScreen = (zoom: { scale: number; position: { x: number; y: number } }, content: { x: number; y: number }) => ({
  x: zoom.position.x + content.x * zoom.scale,
  y: zoom.position.y + content.y * zoom.scale,
});

const toContent = (anchor: { x: number; y: number }, zoom: { position: { x: number; y: number }; scale: number }) => ({
  x: (anchor.x - zoom.position.x) / zoom.scale,
  y: (anchor.y - zoom.position.y) / zoom.scale,
});

describe('zoomAtAnchor', () => {
  const anchor = { x: 120, y: 40 };
  const current = { scale: 2, position: { x: -30, y: 15 } };

  test('keeps the anchored content point fixed on screen', () => {
    const contentUnderAnchor = toContent(anchor, current);
    const before = toScreen(current, contentUnderAnchor);
    const after = toScreen(zoomAtAnchor(current, 1.2, anchor), contentUnderAnchor);

    expect(before.x).toBeCloseTo(anchor.x);
    expect(after.x).toBeCloseTo(anchor.x);
    expect(after.y).toBeCloseTo(anchor.y);
  });

  test('applies the clamped scale factor', () => {
    expect(zoomAtAnchor(current, 1.2, anchor).scale).toBeCloseTo(2.4);
    expect(zoomAtAnchor(current, 0.8, anchor).scale).toBeCloseTo(1.6);
  });

  test('clamps to the min and max scale', () => {
    expect(zoomAtAnchor({ ...current, scale: 0.1 }, 0.5, anchor).scale).toBe(0.1);
    expect(zoomAtAnchor({ ...current, scale: 9 }, 10, anchor).scale).toBe(10);
  });

  test('returns the input unchanged when already at the scale limit', () => {
    const atMin = { scale: 0.1, position: current.position };
    expect(zoomAtAnchor(atMin, 0.5, anchor)).toBe(atMin);

    const atMax = { scale: 10, position: current.position };
    expect(zoomAtAnchor(atMax, 4, anchor)).toBe(atMax);
  });

  test('leaves the offset unchanged when anchoring on the current origin', () => {
    // `transform-origin: 0 0` puts content-origin at `position` on screen, so
    // zooming about that point must not move it.
    expect(zoomAtAnchor(current, 1.5, current.position).position).toEqual(current.position);
  });
});
