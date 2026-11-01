// A document loader that can only load documents. The check lives in code, whatever the model asks for.

import { findDocumentByUrl, PAGES } from "../../_fixtures/research.js";

const VALID_EXTENSIONS = [".pdf", ".docx", ".md", ".txt", ".html"];
const TRUSTED_DOMAINS = ["docs.internal.com", "wiki.company.com"];

// Returns null when the URL is acceptable, or the reason it is not.
export function documentUrlProblem(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "it is not a valid URL";
  }
  if (parsed.protocol !== "https:") return "only https is allowed";
  if (parsed.username || parsed.password) return "URLs with credentials are not allowed";
  if (!TRUSTED_DOMAINS.includes(parsed.hostname)) return `${parsed.hostname} is not a trusted domain`;
  const path = parsed.pathname.toLowerCase();
  if (!VALID_EXTENSIONS.some((extension) => path.endsWith(extension))) return "the path is not a document file";
  return null;
}

export function loadDocument({ url }) {
  const problem = documentUrlProblem(url);
  if (problem) return { content: `Rejected: ${url} does not qualify as a document URL, because ${problem}.`, isError: true };
  const doc = findDocumentByUrl(url);
  if (!doc) return { content: `No document at ${url}.`, isError: true };
  return JSON.stringify({ sourceId: doc.id, url: doc.url, text: doc.text });
}

// The generic tool, for comparison. It validates nothing. Mock only: there is no network call.
export function fetchUrl({ url }) {
  return PAGES[url] ?? `(mock) Body of ${url}`;
}
