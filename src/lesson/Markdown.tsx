import { Fragment, type ReactNode } from 'react';

// The light Markdown used in teach notes: paragraphs, "- " and "1. " lists,
// **bold**, *italic*, single line breaks. Rendered as React nodes (no innerHTML).

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <strong key={`${key}b${i++}`}>{m[1]}</strong> : <em key={`${key}i${i++}`}>{m[2]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(text: string, key: string): ReactNode[] {
  return text.split('\n').map((l, i, all) => (
    <Fragment key={`${key}l${i}`}>
      {inline(l, `${key}l${i}`)}
      {i < all.length - 1 && <br />}
    </Fragment>
  ));
}

export function Markdown({ md }: { md: string }) {
  const blocks = md.trim().split(/\n{2,}/);
  return (
    <div className="md">
      {blocks.map((b, bi) => {
        const rows = b.split('\n');
        if (rows.every((r) => /^- /.test(r))) {
          return (
            <ul key={bi}>
              {rows.map((r, i) => (
                <li key={i}>{inline(r.slice(2), `${bi}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (rows.every((r) => /^\d+\. /.test(r))) {
          return (
            <ol key={bi}>
              {rows.map((r, i) => (
                <li key={i}>{inline(r.replace(/^\d+\. /, ''), `${bi}-${i}`)}</li>
              ))}
            </ol>
          );
        }
        // A heading-ish lead line followed by a list, e.g. "Sounds to watch:\n\n- …" is two blocks already;
        // mixed blocks (text then list lines) render the list part as a list.
        const firstList = rows.findIndex((r) => /^(- |\d+\. )/.test(r));
        if (firstList > 0 && rows.slice(firstList).every((r) => /^(- |\d+\. )/.test(r))) {
          const ordered = /^\d+\. /.test(rows[firstList]!);
          const items = rows.slice(firstList).map((r, i) => <li key={i}>{inline(r.replace(/^(- |\d+\. )/, ''), `${bi}-${i}`)}</li>);
          return (
            <Fragment key={bi}>
              <p>{lines(rows.slice(0, firstList).join('\n'), `${bi}`)}</p>
              {ordered ? <ol>{items}</ol> : <ul>{items}</ul>}
            </Fragment>
          );
        }
        return <p key={bi}>{lines(b, `${bi}`)}</p>;
      })}
    </div>
  );
}
