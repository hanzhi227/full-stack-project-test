import type { Citation } from '../src/contracts';

export function citationMatchesSource(citation: Citation, source: string): boolean {
 const lines = source.split('\n');
 if (!citation.excerpt || !Number.isInteger(citation.startLine) || !Number.isInteger(citation.endLine) ||
     citation.startLine < 1 || citation.endLine < citation.startLine || citation.endLine > lines.length) return false;
 // A chunk ending in a newline still ends on the preceding line; preserve its separator.
 const span = lines.slice(citation.startLine - 1, citation.endLine).join('\n') +
  (citation.endLine < lines.length ? '\n' : '');
 return span.includes(citation.excerpt);
}
