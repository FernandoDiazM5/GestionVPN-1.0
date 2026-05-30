import { TAG_COLORS, TAG_PALETTE } from '../constants';

export function tagColor(tag: string): string {
  if (!TAG_COLORS[tag]) {
    const idx = tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_PALETTE.length;
    TAG_COLORS[tag] = TAG_PALETTE[idx];
  }
  return TAG_COLORS[tag];
}
