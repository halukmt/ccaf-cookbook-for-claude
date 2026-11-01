// Tool handlers over mock data, and a coordinator that runs the three agents in order.
// Every call passes through one guard, which logs it and refuses a tool outside the agent's set.

import { findDocumentById, findDocumentByUrl, PAGES, SEARCH_RESULTS } from "../../_fixtures/research.js";
import { FAST_MODEL, FORCED_TOOL_MODEL } from "../../_shared/client.js";
import { runToolLoop } from "../../_shared/loop.js";
import { documentUrlProblem, loadDocument } from "./load-document.js";
import { agentToolsets, toolNames } from "./toolsets.js";

const refuse = (content) => ({ content, isError: true });

function supports(doc, claim) {
  const words = claim.toLowerCase().match(/[a-z0-9-]{4,}/g) ?? [];
  const body = doc.text.toLowerCase();
  const hits = words.filter((word) => body.includes(word)).length;
  return words.length > 0 && hits / words.length >= 0.6;
}

export function createResearchSession() {
  const state = { log: [], snippets: [], metadataDone: new Set(), gateRefusals: 0, escalations: [], report: null, coverage: null, verifications: [] };

  const handlers = {
    search_web: () => JSON.stringify(SEARCH_RESULTS),
    fetch_page: ({ url }) => PAGES[url] ?? refuse(`No page at ${url}. Use a URL from search_web.`),
    extract_links: ({ url }) => JSON.stringify(PAGES[url]?.match(/https:\S+/g) ?? []),
    save_snippet: ({ text, url }) => {
      state.snippets.push({ text, url });
      return "saved";
    },
    extract_metadata: ({ url }) => {
      const problem = documentUrlProblem(url);
      if (problem) return refuse(`Rejected: ${url}, because ${problem}.`);
      const doc = findDocumentByUrl(url);
      if (!doc) return refuse(`No document at ${url}.`);
      state.metadataDone.add(doc.id);
      const { id, title, author, date, type } = doc;
      return JSON.stringify({ sourceId: id, title, author, date, type });
    },
    load_document: loadDocument,
    extract_data_points: ({ sourceId }) => {
      const doc = findDocumentById(sourceId);
      return doc ? JSON.stringify({ sourceId, dates: doc.text.match(/\d{4}-\d{2}-\d{2}/g) ?? [] }) : refuse(`Unknown source ${sourceId}.`);
    },
    summarise_content: ({ sourceId, summary }) => (findDocumentById(sourceId) && summary ? "recorded" : refuse(`Unknown source ${sourceId}.`)),
    verify_claim: ({ claim, sourceId }) => {
      const doc = findDocumentById(sourceId);
      return doc ? JSON.stringify({ sourceId, supported: supports(doc, claim) }) : refuse(`Unknown source ${sourceId}.`);
    },
    compile_report: ({ title, body }) => {
      state.report = { title, body };
      return "report compiled";
    },
    format_citation: ({ sourceId }) => {
      const doc = findDocumentById(sourceId);
      return doc ? `[${doc.id}] ${doc.author}, "${doc.title}", ${doc.date}.` : refuse(`Unknown source ${sourceId}.`);
    },
    assess_coverage: ({ assessment }) => {
      state.coverage = assessment;
      return "recorded";
    },
    verify_fact: ({ claim, sourceId }) => {
      const doc = findDocumentById(sourceId);
      if (!doc) return refuse(`Unknown source ${sourceId}. This tool checks one source only; use request_verification otherwise.`);
      const result = { claim, sourceId, supported: supports(doc, claim) };
      state.verifications.push(result);
      return JSON.stringify(result);
    },
    request_verification: ({ claim, reason }) => {
      state.escalations.push({ claim, reason });
      return "queued for the coordinator; mark this claim as pending in the report";
    },
  };

  // One handler per agent, so the guard knows who is calling.
  function handlerFor(agent) {
    return (name, input) => {
      const entry = { agent, tool: name, input, allowed: toolNames(agent).includes(name), isError: false };
      state.log.push(entry);
      const finish = (outcome) => {
        entry.isError = typeof outcome === "object" && outcome.isError === true;
        return outcome;
      };
      if (!entry.allowed) return finish(refuse(`${name} is not available to the ${agent} agent.`));
      // Ordering gate: holds whether or not the API accepted a forced tool_choice.
      if (agent === "documentAnalysis" && name !== "extract_metadata" && state.metadataDone.size === 0) {
        state.gateRefusals++;
        return finish(refuse("Refused: call extract_metadata on a document first."));
      }
      return finish(handlers[name](input));
    };
  }

  return { state, handlerFor };
}

const SYSTEMS = {
  webSearch:
    "You are the web search agent. Find sources for the question. Fetch the promising pages and save one snippet per source with " +
    "save_snippet, including every source search returned. Do not analyse them. End with the list of URLs.",
  documentAnalysis:
    "You are the document analysis agent. For each URL you are given, call extract_metadata first, then load_document, then " +
    "extract_data_points and summarise_content for documents you could load. If a URL is rejected, say so and move on. " +
    "End with your findings per source ID.",
  synthesis:
    "You are the synthesis agent. Write the report from the findings you are given. Do not research. Check simple facts against one " +
    "source with verify_fact. A claim that needs several sources goes to request_verification. Then call assess_coverage, " +
    "format_citation for each source, and compile_report last.",
};

export function documentAgentOptions({ forced = true } = {}) {
  return forced
    ? { model: FORCED_TOOL_MODEL, firstToolChoice: { type: "tool", name: "extract_metadata" }, toolChoice: { type: "auto" } }
    : { model: FAST_MODEL, toolChoice: { type: "auto" } };
}

export async function runAgent(session, agent, prompt, { onEvent = () => {}, ...options } = {}) {
  onEvent({ type: "section", title: agent, text: `${agentToolsets[agent].role}. Tools: ${toolNames(agent).join(", ")}.` });
  return runToolLoop({
    prompt,
    system: SYSTEMS[agent],
    tools: agentToolsets[agent].tools,
    handleTool: session.handlerFor(agent),
    model: FAST_MODEL,
    maxTokens: 1200,
    onEvent,
    ...options,
  });
}

const addUsage = (total, { usage }) => {
  total.input_tokens += usage.input_tokens;
  total.output_tokens += usage.output_tokens;
};

// The coordinator dispatches in order and passes results forward. Each agent sees only what it is handed.
export async function runResearch(query, { onEvent = () => {} } = {}) {
  const session = createResearchSession();
  const usage = { input_tokens: 0, output_tokens: 0 };

  const web = await runAgent(session, "webSearch", query, { onEvent });
  addUsage(usage, web);
  const urls = [...new Set(session.state.snippets.map((s) => s.url))];

  const analysis = await runAgent(session, "documentAnalysis", `Question: ${query}\nAnalyse these URLs:\n${urls.join("\n")}`, {
    onEvent,
    ...documentAgentOptions({ forced: true }),
  });
  addUsage(usage, analysis);

  const synthesis = await runAgent(
    session,
    "synthesis",
    `Question: ${query}\n\nFindings:\n${analysis.finalText}\n\nCheck these two claims before writing:\n` +
      `1. Batch requests are retired, according to DOC-1.\n` +
      `2. No gateway failed in production because of the batch request retirement, which needs DOC-1 and DOC-2 together.`,
    { onEvent }
  );
  addUsage(usage, synthesis);

  return { ...session.state, urls, usage, finals: { web: web.finalText, analysis: analysis.finalText, synthesis: synthesis.finalText }, firstDocumentCall: session.state.log.find((e) => e.agent === "documentAnalysis")?.tool ?? null };
}
