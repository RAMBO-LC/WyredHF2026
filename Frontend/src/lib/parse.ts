export function parseFrontmatter(md: string): { frontmatter: Record<string, any>; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: md };
  const fm: Record<string, any> = {};
  m[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      let v: any = line.slice(idx + 1).trim();
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (/^\d+$/.test(v)) v = Number(v);
      fm[k] = v;
    }
  });
  return { frontmatter: fm, body: m[2] };
}
