/**
 * Extract a `[{ q, a }]` list from the `## FAQ` section of an .mdx article.
 *
 * The prompt asks for 3-5 Q&A pairs but doesn't pin a markdown structure, so
 * this parser is permissive:
 *   - Section is bounded by the H2 "FAQ" (case-insensitive) and the next H2.
 *   - Each question is either an H3 (`### Question ?`) or a bolded line
 *     (`**Question ?**`); answer = following paragraphs until the next
 *     question or end of section.
 *
 * Returns `[]` when no FAQ section is found — callers should treat that as
 * "no FAQ schema to emit", not an error.
 */

const FAQ_HEADING_RE = /^##\s+FAQ\b/im;
const NEXT_H2_RE = /^##\s+/m;

export function extractFaqFromBody(body) {
  if (typeof body !== 'string' || !body) return [];
  const start = body.search(FAQ_HEADING_RE);
  if (start === -1) return [];

  // Slice from the heading line to the next H2 (or EOF).
  const afterHeading = body.slice(start).replace(FAQ_HEADING_RE, '');
  const nextH2 = afterHeading.search(NEXT_H2_RE);
  const section = nextH2 === -1 ? afterHeading : afterHeading.slice(0, nextH2);

  const lines = section.split('\n');
  const items = [];
  let current = null;

  const isQuestionLine = (line) => {
    const t = line.trim();
    if (!t) return null;
    // ### Question ?
    const h3 = t.match(/^###+\s+(.+?)\s*$/);
    if (h3) return h3[1].replace(/[*_`]/g, '').trim();
    // **Question ?**  (bold-only line)
    const bold = t.match(/^\*\*(.+?)\*\*\s*:?$/);
    if (bold) return bold[1].trim();
    return null;
  };

  for (const line of lines) {
    const q = isQuestionLine(line);
    if (q) {
      if (current) items.push(current);
      current = { q, a: '' };
      continue;
    }
    if (!current) continue;
    if (line.trim()) {
      current.a += (current.a ? ' ' : '') + line.trim();
    }
  }
  if (current) items.push(current);

  // Drop entries with empty answers (lone H3) and strip residual markdown
  // emphasis from answers — the JSON-LD spec wants plain text.
  return items
    .filter(it => it.q && it.a)
    .map(it => ({
      q: it.q,
      a: it.a.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1'),
    }));
}
