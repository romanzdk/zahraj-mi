/** A rectangle normalised to the page: 0..1 on both axes. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Overlapping horizontal strips of the page, sent enlarged next to the whole photo. AI models
 * misread small noteheads on the full page but read them well when shown large: on a blurry
 * 464 px songbook photo Opus 5.5 matched 36 % of the pitches from the page alone and 97 % with
 * these strips.
 */
export function cropBoxes(strips = 6, height = 0.24): Box[] {
  const step = (1 - height) / (strips - 1);
  return Array.from({ length: strips }, (_, i) => ({ x: 0, y: i * step, w: 1, h: height }));
}

/** How much to enlarge a crop so its width ends up near 1600 px, never shrinking and at most 4x. */
export function cropScale(cropWidthPx: number): number {
  return Math.max(1, Math.min(4, 1600 / Math.max(1, cropWidthPx)));
}
