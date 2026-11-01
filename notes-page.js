// Renders an example's notes.md as a page, for examples that have no interactive viewer.
//
// Covers only the Markdown the notes actually use: headings, paragraphs, lists, tables, fenced
// code, inline code, bold and links. Node built-ins only, like the server.

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Code spans are swapped for placeholders first, so that ** or [ ] inside them stay literal while
// bold text may still wrap around them.
function inline(text) {
  const spans = [];
  const hold = (html) => `\u0000${spans.push(html) - 1}\u0000`;

  return escapeHtml(text.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`)))
    // Local files are not served, so a relative link stays visible as its name, not a dead link.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, target) =>
      hold(/^https?:/.test(target)
        ? `<a href="${target}" target="_blank" rel="noopener">${label}</a>`
        : `<code>${label}</code>`)
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\u0000(\d+)\u0000/g, (_, index) => spans[index]);
}

const tableCells = (line) =>
  line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => inline(cell.trim()));

const isDivider = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);

export function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    } else if (/^#{1,6} /.test(line)) {
      const [, marks, text] = line.match(/^(#{1,6}) (.*)$/);
      html.push(`<h${marks.length}>${inline(text)}</h${marks.length}>`);
      i++;
    } else if (line.trim().startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      const head = tableCells(line).map((cell) => `<th>${cell}</th>`).join("");
      const rows = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) {
        rows.push(`<tr>${tableCells(lines[i]).map((cell) => `<td>${cell}</td>`).join("")}</tr>`);
      }
      html.push(`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`);
    } else if (/^\s*(- |\d+\. )/.test(line)) {
      const tag = /^\s*- /.test(line) ? "ul" : "ol";
      const items = [];
      for (; i < lines.length && lines[i].trim(); i++) {
        if (/^\s*(- |\d+\. )/.test(lines[i])) items.push(lines[i].replace(/^\s*(- |\d+\. )/, ""));
        else items[items.length - 1] += ` ${lines[i].trim()}`; // wrapped list item
      }
      html.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`);
    } else {
      const paragraph = [];
      for (; i < lines.length && lines[i].trim() && !/^(#{1,6} |```|\s*\||\s*- |\s*\d+\. )/.test(lines[i]); i++) {
        paragraph.push(lines[i].trim());
      }
      // A line that matched none of the block forms above must still advance the loop.
      if (!paragraph.length) paragraph.push(lines[i++].trim());
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    }
  }
  return html.join("\n");
}

export function notesPage(example, markdown) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${example.id} ${example.title}`)}</title>
<link rel="stylesheet" href="/assets/style.css">
<style>
  .notes h1 { margin-bottom: 1rem; }
  .notes h2 { font-size: 1.05rem; margin: 1.75rem 0 .5rem; }
  .notes p, .notes li { overflow-wrap: anywhere; }
  .notes code { background: var(--code-bg); padding: .05rem .3rem; border-radius: 4px; font-size: .88em; }
  .notes pre { background: var(--code-bg); padding: .75rem; border-radius: 6px; overflow-x: auto; }
  .notes pre code { padding: 0; }
  .table-wrap { overflow-x: auto; margin: .75rem 0; }
  .notes table { border-collapse: collapse; width: 100%; font-size: .88rem; }
  .notes th, .notes td { border-bottom: 1px solid var(--border); padding: .4rem .6rem; text-align: left; vertical-align: top; }
</style>
</head>
<body>
<main>
  <a class="back" href="/">← Dashboard</a>
  <article class="panel notes">
${markdownToHtml(markdown)}
  </article>
</main>
</body>
</html>`;
}
