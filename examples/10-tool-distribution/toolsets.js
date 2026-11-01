// Three roles, each with its own tools. All schemas are written so they stay valid under `strict: true`:
// every property is required and additionalProperties is false.

const tool = (name, description, properties) => ({
  name,
  description,
  input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
});
const text = (description) => ({ type: "string", description });

// The generic tool this design refuses to hand out. Kept only for the comparison in step 4.
export const FETCH_URL = tool("fetch_url", "Fetches any URL and returns the response body.", { url: text("Any URL") });

const verifyFact = tool(
  "verify_fact",
  "Verifies one simple factual claim against one source document. Use it for quick checks while compiling a report. " +
    "For a claim that needs several sources or cross-referencing, do not use this: call request_verification instead.",
  { claim: text("The factual claim to verify"), sourceId: text("ID of the one source, such as DOC-1") }
);

export const agentToolsets = {
  webSearch: {
    role: "Locates web sources and pulls their content",
    tools: [
      tool("search_web", "Runs a web search for a query and returns the results in ranked order.", { query: text("Search query") }),
      tool("fetch_page", "Fetches the content of a web page found by search_web, by URL.", { url: text("Page URL") }),
      tool("extract_links", "Extracts the hyperlinks from a page found by search_web.", { url: text("Page URL") }),
      tool("save_snippet", "Saves a text snippet with its source URL, for the next agent.", { text: text("Snippet"), url: text("Source URL") }),
    ],
  },
  documentAnalysis: {
    role: "Examines how a document is built and what it says",
    tools: [
      tool("extract_metadata", "Extracts title, author, date and document type of a document, by URL. Mandatory before any other tool.", { url: text("Document URL") }),
      tool(
        "load_document",
        "Loads a document's full text from a validated URL. Accepts only .pdf, .docx, .md, .txt or .html files over https from " +
          "trusted domains, and rejects anything else with a reason. It cannot fetch arbitrary web pages.",
        { url: text("Document URL") }
      ),
      tool("extract_data_points", "Extracts structured fields (dates, amounts, names) from a loaded document, by source ID.", { sourceId: text("Source ID, such as DOC-1") }),
      tool("summarise_content", "Records a concise summary of a loaded document's key arguments.", { sourceId: text("Source ID"), summary: text("Summary") }),
      tool("verify_claim", "Checks whether a claim is supported by one loaded document.", { claim: text("Claim"), sourceId: text("Source ID") }),
    ],
  },
  synthesis: {
    role: "Compiles findings into reports",
    tools: [
      tool("compile_report", "Assembles the research findings into the final report. Call it once, last.", {
        title: text("Report title"),
        body: text("Report text, with source IDs in square brackets"),
      }),
      tool("format_citation", "Formats one source reference in the required citation style.", { sourceId: text("Source ID") }),
      tool("assess_coverage", "Records whether all research questions have been addressed.", { assessment: text("Assessment") }),
      verifyFact,
      tool(
        "request_verification",
        "Asks the coordinator to verify a complex claim that needs several sources or cross-referencing. The coordinator " +
          "answers after the report, so mark the claim as pending in the report.",
        { claim: text("The claim"), reason: text("Why one source is not enough") }
      ),
    ],
  },
};

export const toolNames = (agent) => agentToolsets[agent].tools.map((t) => t.name);
