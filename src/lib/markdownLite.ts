/**
 * A small, safe reader for the Azure DevOps markdown basics used in the indicator descriptions. It only produces a typed tree
 * (never HTML), so the renderer builds React elements and nothing from a sheet is ever injected as markup.
 *
 * Block level: `#`..`######` headings, `-` / `*` / `+` bullet lists, `1.` numbered lists, `>` quotes, `---` rules, paragraphs
 * (consecutive lines join with a space; a blank line ends a block).
 * Inline: `**bold**` / `__bold__`, `*italic*` / `_italic_` (an underscore inside a word - `my_sensor_x` - is NOT emphasis),
 * `` `code` ``, `[text](https://...)` (https links only) and a backslash escape (`\*`).
 * Anything else is plain text, so an unsupported construct is shown as written instead of being lost.
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] };

export type Block =
  | { t: 'heading'; level: number; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'hr' };

// Order matters: escape, code, bold, link, italic. Underscore emphasis must start and end at a word boundary.
const INLINE = /\\([\\`*_{}[\]()#+\-.!>])|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)|\*([^*\s][^*]*)(?<!\\)\*|(?<![A-Za-z0-9_])_([^_\s][^_]*)_(?![A-Za-z0-9_])/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  // Adjacent plain pieces (text between tokens, escaped characters) are one text node.
  const push = (v: string) => {
    if (v === '') return;
    const prev = out[out.length - 1];
    if (prev?.t === 'text') prev.v += v;
    else out.push({ t: 'text', v });
  };
  for (const m of text.matchAll(INLINE)) {
    push(text.slice(last, m.index));
    if (m[1] !== undefined) push(m[1]);
    else if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
    else if (m[3] !== undefined || m[4] !== undefined) out.push({ t: 'bold', c: parseInline((m[3] ?? m[4])!) });
    else if (m[5] !== undefined) out.push({ t: 'link', href: m[6]!, c: parseInline(m[5]) });
    else out.push({ t: 'italic', c: parseInline((m[7] ?? m[8])!) });
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return out;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ t: 'p', c: parseInline(paragraph.join(' ')) });
    if (list) blocks.push(list.ordered ? { t: 'ol', items: list.items } : { t: 'ul', items: list.items });
    if (quote.length > 0) blocks.push({ t: 'quote', c: parseInline(quote.join(' ')) });
    paragraph = [];
    list = null;
    quote = [];
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ t: 'heading', level: heading[1]!.length, c: parseInline(heading[2]!) });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ t: 'hr' });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) flush();
      if (!list) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(parseInline((bullet ?? numbered)![1]!));
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      if (paragraph.length > 0 || list) flush();
      quote.push(q[1]!);
      continue;
    }
    // A plain line right after a list item continues that item; otherwise it joins the running paragraph.
    if (list) {
      const items = list.items;
      const lastItem = items[items.length - 1]!;
      items[items.length - 1] = [...lastItem, { t: 'text', v: ' ' }, ...parseInline(line.trim())];
      continue;
    }
    if (quote.length > 0) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
