// A system prompt can compete with tool descriptions. These are the two prompts under test and a
// small scanner for review: it finds instructions that tie an action to one tool's subject.

export const CONFLICTING_PROMPT = "Always check customer details before you act on any request.";

export const REWRITTEN_PROMPT =
  "You are a support assistant. Choose tools by what the request asks about, as each tool's description explains.";

const ACTION = "(?:check|verify|look ?up|find|get|retrieve|fetch)";
const SUBJECT = "(?:customer|order|account)";
const BIASING = [
  new RegExp(`\\b(?:always|first|must|before)\\b[^.]*\\b${ACTION}\\b[^.]*\\b${SUBJECT}\\b`, "gi"),
  new RegExp(`\\b${ACTION}\\b[^.]*\\b${SUBJECT}\\b[^.]*\\b(?:first|before|always)\\b`, "gi"),
];

export function findToolBiasingPhrases(prompt) {
  return [...new Set(BIASING.flatMap((pattern) => prompt.match(pattern) ?? []))];
}
