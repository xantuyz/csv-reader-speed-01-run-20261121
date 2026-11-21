// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// run(input) returns exactly what csv-reader 1.0.0's readCsv returns for the
// same {text, header}: {columns, rows, errors}. Same broken-row policy, same
// error order, same line counting — only faster.
//
// How it is fast: csv-reader walks one character at a time and builds every
// field with `value += c`. This reader instead takes the common record — a
// line in which no field opens with a quote — in one native sweep: find the
// line end with indexOf('\n'), slice the line, split(',') in C++ (a stray CR
// inside a field is stripped from the split fields, one stray_cr error per
// CR, in field order). Records holding a field that opens with a quote go
// through a slow path that still jumps with indexOf instead of walking
// characters: an unquoted field is one slice to the nearest comma or line
// break, a quoted field is found with indexOf('"'), and only quoted chunks
// holding a line break pay a character loop, to turn CRLF / lone CR into LF
// and count the lines exactly as the reference does. No per-field result
// objects: one field's value, ending and junk length live in scalars.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. Dependency-free ES module.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and (for a quoted field's
  // junk) how many characters the junk kept. Scalars, no object per field.
  let fv = '';
  let fe = 0;
  let fa = 0;

  // Appends text[a..b) to parts, turning each CRLF or lone CR into one LF and
  // counting every line break it holds, exactly as the reference reads a
  // quoted field. Chunks with no line break go in whole, unsliced by hand.
  function pushChunk(parts, a, b) {
    const chunk = text.slice(a, b);
    if (chunk.indexOf('\n') === -1 && chunk.indexOf('\r') === -1) {
      parts.push(chunk);
      return;
    }
    let s = '';
    let i = a;
    while (i < b) {
      const c = text.charCodeAt(i);
      if (c === 13) {
        s += '\n';
        line += 1;
        i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
      } else if (c === 10) {
        s += '\n';
        line += 1;
        i += 1;
      } else {
        let j = i + 1;
        while (j < b) {
          const d = text.charCodeAt(j);
          if (d === 13 || d === 10) break;
          j += 1;
        }
        s += text.slice(i, j);
        i = j;
      }
    }
    parts.push(s);
  }

  // Reads unquoted characters onto `init` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Sets fv / fe / fa, where
  // fa counts the characters kept (a quote_junk check counts it).
  function readUnquoted(init) {
    let acc = init;
    let added = 0;
    for (;;) {
      let c = text.indexOf(',', pos);
      if (c === -1) c = n;
      let l = text.indexOf('\n', pos);
      if (l === -1) l = n;
      const m = c < l ? c : l;
      const seg = text.slice(pos, m);
      const r = seg.indexOf('\r');
      if (r === -1) {
        fv = acc + seg;
        fa = added + seg.length;
        if (m === n) {
          pos = n;
          fe = END;
        } else if (m === c) {
          pos = m + 1;
          fe = COMMA;
        } else {
          pos = m + 1;
          line += 1;
          fe = LINE_BREAK;
        }
        return;
      }
      if (r === seg.length - 1 && m === l && m !== n) {
        // The CR sits right before the LF: a CRLF line break.
        fv = acc + seg.slice(0, r);
        fa = added + r;
        pos = m + 1;
        line += 1;
        fe = LINE_BREAK;
        return;
      }
      // A lone CR: dropped, and the field goes on after it.
      acc += seg.slice(0, r);
      added += r;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = pos + r + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fv / fe / fa.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const parts = [];
    let p = pos + 1;
    let q = -1;
    let closed = false;
    for (;;) {
      q = text.indexOf('"', p);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        pushChunk(parts, p, q);
        parts.push('"');
        p = q + 2;
        continue;
      }
      pushChunk(parts, p, q);
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
    const value = parts.length === 1 ? parts[0] : parts.join('');
    pos = q + 1;
    if (pos >= n) {
      fv = value;
      fe = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fv = value;
      fe = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fv = value;
      fe = LINE_BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fv = value;
      fe = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    readUnquoted(value);
    if (fa > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  // Ends one record: a line left with no characters is no record; the first
  // record sets the width (and is the header when header is true); the rest
  // are padded or cut to it, with short_row / long_row when they end.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: no field in this line opens with a quote — the line holds no
    // field-opening quote (not at its start, none after a comma) — so the
    // record ends at its line break and split(',') reads it whole. A quote
    // anywhere else in the line is a literal inside an unquoted field.
    let eol = text.indexOf('\n', pos);
    if (eol === -1) eol = n;
    let end = eol;
    if (eol < n && text.charCodeAt(eol - 1) === 13) end = eol - 1;
    const lineText = text.slice(pos, end);
    if (lineText.charCodeAt(0) !== 34 && lineText.indexOf(',"') === -1) {
      const fields = lineText.split(',');
      pos = eol < n ? eol + 1 : n;
      if (eol < n) line += 1;
      if (lineText.indexOf('\r') !== -1) {
        // Stray CRs inside unquoted fields: dropped, one error each, in
        // field order (before any short_row / long_row of this record).
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          const r = f.indexOf('\r');
          if (r !== -1) {
            const cut = f.split('\r');
            for (let k = 1; k < cut.length; k++) {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            }
            fields[i] = cut.join('');
          }
        }
      }
      finishRecord(fields, false);
      continue;
    }

    // Slow path: some field in this record opens with a quote.
    const fields = [];
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fv);
    } while (fe === COMMA);
    finishRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
