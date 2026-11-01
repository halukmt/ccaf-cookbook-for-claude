// One server for all examples.
//
// Why central rather than one per example: 30 copies of this file would fight over one port and
// give 30 places to fix. The pages still live in their own directories; only the plumbing is shared.
//
// The API key never reaches the browser. The page talks to this server, this server talks to
// the Anthropic API. Node built-ins only, no dependencies.
//
// Routes
//   GET /                        the dashboard
//   GET /assets/style.css        shared stylesheet
//   GET /api/examples            catalogue as JSON, with viewer/notes availability
//   GET /example/<slug>          that example's ui.html, or its notes.md if it has no viewer
//   GET /api/<slug>/run?…        Server-Sent Events stream from that example's viewer.js

import { createServer } from "node:http";
import { readFile, access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { exec } from "node:child_process";
import { SECTIONS, EXAMPLES_BY_SLUG } from "./examples.js";
import { notesPage } from "./notes-page.js";

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4111;

const exists = (path) => access(path).then(() => true, () => false);
const exampleDir = (example) => resolve(root, "examples", example.slug);

function send(res, status, contentType, body) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

async function catalogue() {
  return Promise.all(
    SECTIONS.map(async (section) => ({
      title: section.title,
      examples: await Promise.all(
        section.examples.map(async (example) => {
          const dir = exampleDir(example);
          return {
            ...example,
            path: `examples/${example.slug}`,
            hasViewer: await exists(resolve(dir, "ui.html")),
            hasNotes: await exists(resolve(dir, "notes.md")),
          };
        })
      ),
    }))
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (path === "/") {
      return send(res, 200, "text/html; charset=utf-8",
        await readFile(resolve(root, "dashboard.html"), "utf8"));
    }

    if (path === "/assets/style.css") {
      return send(res, 200, "text/css; charset=utf-8",
        await readFile(resolve(root, "assets", "style.css"), "utf8"));
    }

    if (path === "/assets/example-page.js") {
      return send(res, 200, "text/javascript; charset=utf-8",
        await readFile(resolve(root, "assets", "example-page.js"), "utf8"));
    }

    if (path === "/api/examples") {
      return send(res, 200, "application/json; charset=utf-8",
        JSON.stringify(await catalogue()));
    }

    // GET /example/<slug>
    const pageMatch = path.match(/^\/example\/([\w-]+)$/);
    if (pageMatch) {
      const example = EXAMPLES_BY_SLUG.get(pageMatch[1]);
      if (!example) return send(res, 404, "text/plain", "unknown example");

      const file = resolve(exampleDir(example), "ui.html");
      if (!(await exists(file))) {
        // Configuration examples have nothing to run in a browser, so their page shows the notes.
        const notes = resolve(exampleDir(example), "notes.md");
        if (await exists(notes)) {
          return send(res, 200, "text/html; charset=utf-8",
            notesPage(example, await readFile(notes, "utf8")));
        }
        return send(res, 404, "text/html; charset=utf-8",
          `<p style="font:15px system-ui;padding:2rem">Example ${example.id} has no page. ` +
          `<a href="/">Back to the dashboard</a></p>`);
      }
      return send(res, 200, "text/html; charset=utf-8", await readFile(file, "utf8"));
    }

    // GET /api/<slug>/run
    const apiMatch = path.match(/^\/api\/([\w-]+)\/run$/);
    if (apiMatch) {
      const example = EXAMPLES_BY_SLUG.get(apiMatch[1]);
      if (!example) return send(res, 404, "text/plain", "unknown example");

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // Every run is written to _runs/ as it happens. Model output varies between identical
      // requests, so "look at what I just saw in the browser" is otherwise impossible — the next
      // request returns something different. A saved run is a fixed artefact two people can
      // discuss, and it makes runs comparable instead of one-shot.
      const startedAt = new Date().toISOString();
      const runId = `${example.slug}_${startedAt.replace(/[:.]/g, "-")}`;
      const events = [];

      const emit = (event) => {
        events.push(event);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const saveRun = async () => {
        try {
          await mkdir(resolve(root, "_runs"), { recursive: true });
          await writeFile(
            resolve(root, "_runs", `${runId}.json`),
            JSON.stringify(
              {
                runId,
                example: example.id,
                slug: example.slug,
                startedAt,
                finishedAt: new Date().toISOString(),
                params: Object.fromEntries(url.searchParams),
                events,
              },
              null,
              2
            )
          );
          console.log(`  run saved: _runs/${runId}.json`);
          res.write(`data: ${JSON.stringify({ type: "runSaved", runId })}\n\n`);
        } catch (error) {
          console.warn(`  could not save run: ${error.message}`);
        }
      };

      try {
        // Imported on demand, not at startup: a broken example then fails on its own page
        // instead of taking the whole lab down.
        //
        // The query string busts the ESM module cache. Without it, Node keeps the first version
        // of the example code in memory for the life of the process, and every edit would need a
        // server restart to show up — which is exactly the wrong friction while building an example.
        const entry = pathToFileURL(resolve(exampleDir(example), "viewer.js")).href;
        const module = await import(`${entry}?v=${Date.now()}`);
        await module.run(url.searchParams, emit);
      } catch (error) {
        emit({ type: "error", message: error.message });
      }

      await saveRun();
      return res.end();
    }

    send(res, 404, "text/plain", "not found");
  } catch (error) {
    send(res, 500, "text/plain", error.message);
  }
});

const address = `http://localhost:${PORT}`;

// Without this, a second start prints a raw Node stack trace. The usual cause is simply that
// the viewer is already running — say that instead.
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `\n  Port ${PORT} is already taken — the viewer is most likely already running.\n` +
        `\n    Just open it:   ${address}` +
        `\n    Or stop it:     double-click stop.cmd, or press Ctrl+C in its window\n`
    );
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`\n  Viewer:  ${address}\n  Stop with Ctrl+C\n`);
  if (process.platform === "win32" && !process.env.NO_OPEN) {
    exec(`start "" "${address}"`);
  }
});
