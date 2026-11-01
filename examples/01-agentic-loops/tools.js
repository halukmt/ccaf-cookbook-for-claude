// Two things live in this file, and keeping them apart matters:
//
//   toolDefinitions      — the JSON Schema contract Claude sees. This is all the model knows.
//   toolImplementations  — the local functions our own code runs when Claude asks for a tool.
//
// Claude never executes anything. It only ever says "call calculator with this input".
// Running it is our job — that handoff is what the agentic loop in step 2 is built around.

export const toolDefinitions = [
  {
    name: "calculator",
    description:
      "Evaluates a single arithmetic expression and returns the numeric result. " +
      'Accepts digits, the operators + - * / %, parentheses and decimal points, e.g. "83500000 * 0.12". ' +
      "Use this for every calculation, including simple ones. " +
      "Do NOT use it to look up facts — use web_search for that.",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: 'The arithmetic expression to evaluate, e.g. "17 * 23".',
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "web_search",
    description:
      "Searches the web and returns matching results with a title, a snippet containing the " +
      "relevant facts, and a source URL. Use this to look up facts, figures and statistics that " +
      "are not already known. Do NOT use it for arithmetic — use calculator for that.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'The search query in natural language, e.g. "population of Germany".',
        },
      },
      required: ["query"],
    },
  },
];

// --- Implementations -------------------------------------------------------

// Only arithmetic characters are allowed through. Because the whitelist excludes letters,
// no identifier — and therefore no function call — can reach the evaluator below.
const SAFE_EXPRESSION = /^[0-9+\-*/%.()\s]+$/;

function calculator({ expression }) {
  if (!SAFE_EXPRESSION.test(expression)) {
    throw new Error(`Unsupported characters in expression: ${expression}`);
  }
  const result = Function(`"use strict"; return (${expression});`)();
  return { expression, result };
}

// A stub standing in for a real search API. The facts are canned so the example stays
// deterministic and free — and they carry numbers, so a later step can search for a value
// and then feed it into the calculator.
const MOCK_CORPUS = [
  {
    keywords: ["germany", "german", "deutschland", "population"],
    title: "Germany — Population 2024 (Federal Statistical Office)",
    snippet: "Germany had a population of 83,500,000 at the end of 2024.",
    url: "https://example.org/statistics/germany-population",
  },
  {
    keywords: ["berlin", "rent", "apartment", "housing"],
    title: "Berlin — Average Rent 2024 (Housing Market Report)",
    snippet: "The average rent for a new lease in Berlin was 14.50 EUR per square metre in 2024.",
    url: "https://example.org/statistics/berlin-rent",
  },
  {
    keywords: ["battery", "ev", "electric", "lithium", "price"],
    title: "EV Battery Pack Prices 2024 (Industry Survey)",
    snippet: "The average price of an EV battery pack fell to 115 USD per kilowatt-hour in 2024.",
    url: "https://example.org/statistics/ev-battery-price",
  },
];

function webSearch({ query }) {
  const needle = query.toLowerCase();
  const matches = MOCK_CORPUS.filter((doc) => doc.keywords.some((k) => needle.includes(k)));

  return {
    query,
    resultCount: matches.length,
    results: matches.map(({ title, snippet, url }) => ({ title, snippet, url })),
  };
}

export const toolImplementations = {
  calculator,
  web_search: webSearch,
};
