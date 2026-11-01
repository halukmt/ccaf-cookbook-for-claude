// Step 4 — the core scenario. Research once, wrap each subagent's findings into a ResearchOutput,
// then build the synthesis prompt from them — the complete structured
// findings embedded verbatim, not just the claim text — and spawn the synthesis subagent with it.
//
// Paid once: the result is saved to step-4-results.json, and a new paid run needs --force.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { check, finishChecks } from "../../_shared/check.js";
import { baseOptions } from "./env.js";
import { WEB_SEARCH_AGENT, DOC_ANALYSIS_AGENT, SYNTHESIS_AGENT } from "./agents.js";
import { parseFindings, subagentTexts, toResearchOutput } from "./finding.js";

const exampleDir = dirname(fileURLToPath(import.meta.url));
const resultsFile = new URL("./step-4-results.json", import.meta.url);

async function gatherResearch(topic) {
  const stream = query({
    prompt:
      `In a single response, spawn both web-search and doc-analysis in parallel. Ask web-search ` +
      `to find one fact about: ${topic}. Ask doc-analysis to read sample-report.md and report ` +
      `one relevant finding.`,
    options: {
      ...baseOptions,
      cwd: exampleDir,
      allowedTools: ["Agent"],
      agents: { "web-search": WEB_SEARCH_AGENT, "doc-analysis": DOC_ANALYSIS_AGENT },
      maxTurns: 8,
    },
  });

  const agentNameByToolUseId = new Map();
  const findingsByAgent = { "web-search": [], "doc-analysis": [] };
  const toolsCalled = { "web-search": [], "doc-analysis": [] };
  // What the search tool really returned, kept so a cited URL can be traced to it.
  const subagentToolResults = [];
  let costUsd = 0;
  for await (const message of stream) {
    if (message.type === "assistant" && !message.parent_tool_use_id) {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && block.name === "Agent") {
          agentNameByToolUseId.set(block.id, block.input?.subagent_type);
        }
      }
    }
    if (message.type === "assistant" && message.parent_tool_use_id) {
      const agentName = agentNameByToolUseId.get(message.parent_tool_use_id);
      for (const block of message.message.content) {
        if (block.type === "tool_use") toolsCalled[agentName]?.push(block.name);
      }
    }
    if (message.type === "user" && message.parent_tool_use_id) {
      subagentToolResults.push(JSON.stringify(message.message?.content ?? "") + JSON.stringify(message.tool_use_result ?? ""));
    }
    for (const { agentToolUseId, text } of subagentTexts(message)) {
      const agentName = agentNameByToolUseId.get(agentToolUseId);
      const known = findingsByAgent[agentName];
      if (!known) continue;
      for (const finding of parseFindings(text, agentName)) {
        if (!known.some((f) => f.claim === finding.claim)) known.push(finding);
      }
    }
    if (message.type === "result") costUsd += message.total_cost_usd ?? 0;
  }
  return {
    webSearchFindings: findingsByAgent["web-search"],
    docAnalysisFindings: findingsByAgent["doc-analysis"],
    toolsCalled,
    subagentToolResults,
    costUsd,
  };
}

async function synthesise(webSearchResults, docAnalysisResults) {
  // Findings embedded verbatim, full metadata intact.
  const synthesisPrompt = `Combine the research findings below into one coherent report. Each claim MUST carry a citation giving its source URL and page number.

Findings from web search:
${JSON.stringify(webSearchResults.findings, null, 2)}

Findings from document analysis:
${JSON.stringify(docAnalysisResults.findings, null, 2)}

Produce a report in which each factual claim points to its source.`;

  const stream = query({
    prompt: `Spawn synthesis with exactly this task: ${synthesisPrompt}`,
    options: {
      ...baseOptions,
      cwd: exampleDir,
      allowedTools: ["Agent"],
      agents: { synthesis: SYNTHESIS_AGENT },
      maxTurns: 3,
    },
  });

  let report = "";
  let promptSynthesisReceived = "";
  let costUsd = 0;
  for await (const message of stream) {
    if (message.type === "assistant" && !message.parent_tool_use_id) {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && block.name === "Agent") promptSynthesisReceived = block.input?.prompt ?? "";
      }
    }
    for (const { text } of subagentTexts(message)) report = text;
    if (message.type === "result") costUsd += message.total_cost_usd ?? 0;
  }
  return { report, promptSynthesisReceived, costUsd };
}

async function paidRun() {
  const topic = "EV battery second-life storage";
  const ranAt = new Date().toISOString();
  const research = await gatherResearch(topic);
  const webSearchResults = toResearchOutput(research.webSearchFindings, topic, ranAt);
  const docAnalysisResults = toResearchOutput(research.docAnalysisFindings, topic, ranAt);
  const synthesis = await synthesise(webSearchResults, docAnalysisResults);
  const saved = {
    ranAt,
    webSearchResults,
    docAnalysisResults,
    report: synthesis.report,
    promptSynthesisReceived: synthesis.promptSynthesisReceived,
    toolsCalled: research.toolsCalled,
    subagentToolResults: research.subagentToolResults,
    costUsd: { research: research.costUsd, synthesis: synthesis.costUsd },
  };
  writeFileSync(resultsFile, JSON.stringify(saved, null, 2));
  console.log("Saved to step-4-results.json for step 5's verification pass.");
  return saved;
}

let data;
if (existsSync(resultsFile) && !process.argv.includes("--force")) {
  console.log("Using saved step-4-results.json, no API call. Pass --force for a new paid run.");
  data = JSON.parse(readFileSync(resultsFile, "utf8"));
} else {
  data = await paidRun();
}

const { webSearchResults, docAnalysisResults, report } = data;
const webFindings = webSearchResults.findings;
const docFindings = docAnalysisResults.findings;

console.log(`\n${"=".repeat(70)}\nResearch gathered (ResearchOutput shape)\n${"=".repeat(70)}`);
console.log("web-search:", JSON.stringify(webSearchResults, null, 2));
console.log("doc-analysis:", JSON.stringify(docAnalysisResults, null, 2));

console.log(`\n${"=".repeat(70)}\nSynthesis report — full findings, metadata intact\n${"=".repeat(70)}`);
console.log(report);

console.log(`\n${"=".repeat(70)}\nWhat a naive prompt would send instead (reasoned through, not run)\n${"=".repeat(70)}`);
console.log(JSON.stringify([...webFindings, ...docFindings].map((f) => f.claim), null, 2));
console.log(
  "\nStripped to claim text, source_url/document_name/page_number never reach synthesis's " +
    "context. It has no tools and cannot look anything up, so any citation it added would have " +
    "to be invented — the failure traces to what the coordinator passed, not to how synthesis " +
    "was prompted."
);
console.log(`\nCost: research $${data.costUsd.research.toFixed(4)}, synthesis $${data.costUsd.synthesis.toFixed(4)}.\n`);

// The document's own text, page by page, to test a page citation against.
const pages = readFileSync(new URL("./sample-report.md", import.meta.url), "utf8").split(/--- Page \d+ ---/).slice(1);
const numbersIn = (text) => text.match(/\d+(?:\.\d+)?/g) ?? [];
const docNumbersOnPage = (f) => numbersIn(f.claim).every((n) => pages[f.page_number - 1]?.includes(n));
const received = data.promptSynthesisReceived ?? "";
const allResults = (data.subagentToolResults ?? []).join("\n");

check("web-search returned a finding with a URL", webFindings.length > 0 && webFindings.every((f) => /^https?:\/\//.test(f.source_url)), webFindings.map((f) => f.source_url).join(", "));
check("web-search really called its search tool", data.toolsCalled["web-search"].includes("WebSearch"), data.toolsCalled["web-search"].join(", "));
check("Each cited URL appears in what the search tool returned", webFindings.every((f) => allResults.includes(f.source_url)));
check("doc-analysis returned a finding with a document and page", docFindings.length > 0 && docFindings.every((f) => f.document_name.includes("sample-report") && f.page_number !== null));
check("Each document claim's figures are on the page it cites", docFindings.every(docNumbersOnPage));
check("Synthesis really received the source metadata, not just claims", webFindings.every((f) => received.includes(f.source_url)) && docFindings.every((f) => received.includes(f.document_name) && received.includes(`"page_number": ${f.page_number}`)));
check("The report is not empty", report.trim().length > 100, `${report.length} characters`);
finishChecks();
