// A local pass-through proxy that records every request a Claude Code child sends to the API.
//
// What a stream or a log says the model saw is an inference. The request body is the fact. Point
// the child at this proxy with ANTHROPIC_BASE_URL and read what really went over the wire. Nothing
// is written to disk, and request headers (which hold the key) are forwarded, never stored.

import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";

export async function startApiCapture({ target = "api.anthropic.com" } = {}) {
  const requests = [];

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      try {
        if (req.url.includes("/messages") && !req.url.includes("count_tokens")) {
          requests.push(JSON.parse(body.toString("utf8")));
        }
      } catch {
        // A body that is not JSON is forwarded unrecorded.
      }
      const upstream = httpsRequest(
        { host: target, path: req.url, method: req.method, headers: { ...req.headers, host: target } },
        (reply) => {
          res.writeHead(reply.statusCode, reply.headers);
          reply.pipe(res);
        }
      );
      upstream.on("error", (error) => {
        res.writeHead(502);
        res.end(error.message);
      });
      upstream.end(body);
    });
  });

  await new Promise((done) => server.listen(0, "127.0.0.1", done));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(done);
      }),
  };
}

function blockText(block) {
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) {
    return block.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
  }
  return "";
}

// Every tool result the model was really sent, with the name of the tool that produced it.
export function toolResultsSent(requests) {
  const names = new Map();
  const results = new Map();
  for (const request of requests) {
    for (const message of request.messages ?? []) {
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content) {
        if (block.type === "tool_use") names.set(block.id, block.name);
        if (block.type === "tool_result") {
          results.set(block.tool_use_id, {
            toolName: names.get(block.tool_use_id) ?? "",
            text: blockText(block),
            isError: Boolean(block.is_error),
          });
        }
      }
    }
  }
  return [...results.values()];
}
