/** First user-visible grapheme (emoji-safe). Falls back for older runtimes. */
export function takeFirstGrapheme(input: string): string {
  const s = String(input || '').trim();
  if (!s) return '';
  try {
    const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    if (typeof Seg === 'function') {
      const seg = new Seg(undefined, { granularity: 'grapheme' });
      for (const { segment } of seg.segment(s) as Iterable<{ segment: string }>) {
        const t = segment.trim();
        if (t) return t;
      }
    }
  } catch {
    // ignore
  }
  return [...s][0] || '';
}
