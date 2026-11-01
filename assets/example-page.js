// Shared browser code for example pages: runs an example over SSE and renders its events.
//
// Page usage:
//   mountExamplePage({
//     api: "/api/<slug>/run",
//     fields: [{ name: "prompt", label: "Prompt", value: "...", kind: "textarea" }],
//     presets: [{ label: "Example", values: { prompt: "..." } }],
//     runLabel: "Run",
//   });
//
// Events an example can emit:
//   { type: "section", title, text }
//   { type: "card", title, badge, tone, text, data }   tone: good | warn | tool | muted
//   { type: "tool", name, input, result, isError }
//   { type: "check", label, pass, detail }
//   { type: "summary", items: [[value, label], ...] }
//   { type: "error", message }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const PAGE_CSS = `
  .examples { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .9rem; }
  .section-title { font-size: 1rem; margin: 1.4rem 0 .2rem; }
  .section-text { color: var(--muted); font-size: .85rem; margin: 0 0 .7rem; max-width: 65ch; }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: .4rem; }
  .card-title { font-weight: 650; }
  .card-text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .data { margin: .5rem 0 0; padding: .6rem .75rem; background: var(--code-bg); border-radius: 6px;
    font-size: .76rem; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--muted); }
  .tone-good { color: var(--done); } .tone-warn { color: var(--warn); }
  .tone-tool { color: var(--tool); } .tone-muted { color: var(--muted); }
  .panel.edge-good { border-left: 3px solid var(--done); }
  .panel.edge-warn { border-left: 3px solid var(--warn); }
  .tool-name { font-size: .82rem; font-weight: 700; color: var(--tool); overflow-wrap: anywhere; }
  .panel.tool-error .tool-name { color: var(--warn); }
  .check { display: flex; gap: .6rem; padding: .3rem 0; border-bottom: 1px solid var(--border); font-size: .88rem; }
  .check:last-child { border-bottom: 0; }
  .check b { flex: 0 0 2.6rem; }
  .check small { display: block; color: var(--muted); overflow-wrap: anywhere; }
  .summary { display: flex; gap: 1.5rem; flex-wrap: wrap; }
  .summary b { display: block; font-size: 1.3rem; }
  .summary span { color: var(--muted); font-size: .75rem; }
  .status { font-size: .82rem; color: var(--muted); }
`;

function asText(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function mountExamplePage({ api, fields = [], presets = [], runLabel = "Run", hint }) {
  const style = el("style");
  style.textContent = PAGE_CSS;
  document.head.append(style);

  const root = document.getElementById("example");
  const panel = el("div", "panel");
  const inputs = new Map();

  for (const field of fields) {
    const id = `field-${field.name}`;
    const label = el("label", "", field.label);
    label.htmlFor = id;
    let input;
    if (field.options) {
      input = el("select");
      for (const [value, text] of field.options) {
        const option = el("option", "", text);
        option.value = value;
        input.append(option);
      }
    } else if (field.kind === "textarea") {
      input = el("textarea");
    } else {
      input = el("input");
      input.type = field.kind ?? "text";
    }
    input.id = id;
    input.value = field.value ?? "";
    inputs.set(field.name, input);
    const wrap = el("div");
    wrap.style.marginBottom = ".6rem";
    wrap.append(label, input);
    panel.append(wrap);
  }

  const row = el("div", "row");
  const button = el("button", "", runLabel);
  const status = el("span", "status");
  row.append(button, status);
  panel.append(row);

  if (presets.length) {
    const examples = el("div", "examples");
    for (const preset of presets) {
      const b = el("button", "ghost", preset.label);
      b.type = "button";
      b.onclick = () => {
        for (const [name, value] of Object.entries(preset.values)) inputs.get(name).value = value;
      };
      examples.append(b);
    }
    panel.append(examples);
  }
  if (hint) panel.append(el("p", "hint", hint));

  const output = el("div");
  output.append(el("p", "empty", "No run yet."));
  root.append(panel, output);

  const addPanel = (className = "") => {
    const node = el("div", `panel ${className}`);
    output.append(node);
    return node;
  };

  let checksPanel = null;

  const handlers = {
    section(event) {
      checksPanel = null;
      output.append(el("h2", "section-title", event.title));
      if (event.text) output.append(el("p", "section-text", event.text));
    },
    card(event) {
      checksPanel = null;
      const edge = event.tone === "good" ? "edge-good" : event.tone === "warn" ? "edge-warn" : "";
      const node = addPanel(edge);
      const head = el("div", "card-head");
      head.append(el("span", "card-title", event.title ?? ""));
      if (event.badge) head.append(el("span", `badge tone-${event.tone ?? "muted"}`, event.badge));
      node.append(head);
      if (event.text) node.append(el("div", "card-text", event.text));
      if (event.data !== undefined) node.append(el("pre", "data", asText(event.data)));
    },
    tool(event) {
      checksPanel = null;
      const node = addPanel(event.isError ? "tool-error edge-warn" : "");
      node.append(el("div", "tool-name", `${event.name}(${JSON.stringify(event.input)})`));
      node.append(el("pre", "data", asText(event.result)));
    },
    check(event) {
      if (!checksPanel) checksPanel = addPanel();
      const line = el("div", "check");
      line.append(el("b", event.pass ? "tone-good" : "tone-warn", event.pass ? "PASS" : "FAIL"));
      const text = el("div", "", event.label);
      if (event.detail) text.append(el("small", "", event.detail));
      line.append(text);
      checksPanel.append(line);
    },
    summary(event) {
      checksPanel = null;
      const node = addPanel();
      const summary = el("div", "summary");
      for (const [value, label] of event.items) {
        const cell = el("div");
        cell.append(el("b", "", String(value)), el("span", "", label));
        summary.append(cell);
      }
      node.append(summary);
    },
    error(event) {
      const node = addPanel("edge-warn");
      node.append(el("div", "card-title tone-warn", "Run failed"));
      node.append(el("div", "card-text", event.message));
    },
  };

  button.onclick = () => {
    output.replaceChildren();
    checksPanel = null;
    button.disabled = true;

    const params = new URLSearchParams();
    for (const [name, input] of inputs) params.set(name, input.value);

    const started = Date.now();
    const tick = () => { status.textContent = `Running, ${Math.round((Date.now() - started) / 1000)} s`; };
    tick();
    const timer = setInterval(tick, 1000);

    const stream = new EventSource(`${api}?${params}`);
    const finish = () => {
      stream.close();
      clearInterval(timer);
      button.disabled = false;
      status.textContent = `Finished after ${Math.round((Date.now() - started) / 1000)} s`;
    };

    stream.onmessage = (message) => {
      const event = JSON.parse(message.data);
      handlers[event.type]?.(event);
      if (event.type === "runSaved") finish();
    };
    stream.onerror = finish;
  };
}
