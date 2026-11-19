import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdownLite';

describe('parseInline', () => {
  it('reads bold, italic, code and https links', () => {
    expect(parseInline('a **b** _c_ `d` [e](https://x.io/y)')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'bold', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'italic', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'd' },
      { t: 'text', v: ' ' },
      { t: 'link', href: 'https://x.io/y', c: [{ t: 'text', v: 'e' }] },
    ]);
  });

  it('never turns the underscores of a sensor name into emphasis', () => {
    expect(parseInline('acceleration_rms_x_eq_1 and _real_')).toEqual([
      { t: 'text', v: 'acceleration_rms_x_eq_1 and ' },
      { t: 'italic', c: [{ t: 'text', v: 'real' }] },
    ]);
  });

  it('keeps a non-https link and an unmatched marker as plain text, and honours an escape', () => {
    expect(parseInline('[a](javascript:alert(1)) **open \\*x\\*')).toEqual([{ t: 'text', v: '[a](javascript:alert(1)) **open *x*' }]);
  });
});

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, lists, quotes and rules; a raw html tag stays text', () => {
    const blocks = parseMarkdown(['## RMS', 'line one', 'line two', '', '- a', '- b', 'more of b', '1. x', '', '> note', '---', '<script>x</script>'].join('\r\n'));
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'p', 'ul', 'ol', 'quote', 'hr', 'p']);
    expect(blocks[0]).toMatchObject({ level: 2 });
    expect(blocks[1]).toEqual({ t: 'p', c: [{ t: 'text', v: 'line one line two' }] });
    expect(blocks[2]).toMatchObject({ t: 'ul', items: [[{ t: 'text', v: 'a' }], [{ t: 'text', v: 'b' }, { t: 'text', v: ' ' }, { t: 'text', v: 'more of b' }]] });
    expect(blocks[6]).toEqual({ t: 'p', c: [{ t: 'text', v: '<script>x</script>' }] });
  });

  it('returns nothing for blank text', () => {
    expect(parseMarkdown('  \n ')).toEqual([]);
  });
});
