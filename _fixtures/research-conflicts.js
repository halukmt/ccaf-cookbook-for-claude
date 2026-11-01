// Further invented documents about the same invented spring release in research.js, with disagreements built in.
// Nothing here is a real fact about any specification. Each `measure` below has a known conflict for checking.

export const CONFLICT_DOCUMENTS = [
  {
    id: "DOC-3",
    url: "https://survey.example.org/spring-adoption-q2.html",
    title: "Adoption survey, second quarter",
    author: "Independent Protocol Survey",
    date: "2031-04-20",
    type: "survey",
    text:
      "Of 412 organisations surveyed in April, 38% had adopted session tokens. " +
      "The median budget for the migration was $120,000, counting licences and contractor fees only.",
  },
  {
    id: "DOC-4",
    url: "https://survey.example.org/spring-adoption-q3.html",
    title: "Adoption survey, third quarter",
    author: "Independent Protocol Survey",
    date: "2031-08-18",
    type: "survey",
    text:
      "Of 430 organisations surveyed in August, 61% had adopted session tokens. " +
      "Respondents named gateway compatibility as the main remaining blocker.",
  },
  {
    id: "DOC-5",
    url: "https://analyst.example.net/spring-migration-costs",
    title: "What the spring migration really costs",
    author: "Harwell Analysts",
    date: "2031-04-28",
    type: "analyst note",
    text:
      "We estimate the median migration budget at $210,000 once staff time is counted alongside licences and contractors. " +
      "Most teams needed ten weeks from start to finish.",
  },
  {
    id: "DOC-6",
    url: "https://news.example.com/gateway-vendors-patch",
    title: "Gateway vendors race to patch before the deadline",
    author: "Network Daily",
    date: "2031-05-20",
    type: "news",
    text:
      "Two major gateway vendors shipped emergency patches in May, after customers reported dropped sessions. " +
      "The working group declined to delay the June deadline.",
  },
];

// Where the documents really disagree. A claim about a measure must come with its own document's value.
export const KNOWN_CONFLICTS = {
  adoption_rate: {
    values: { "DOC-3": "38%", "DOC-4": "61%" },
    kind: "temporal",
    note: "Same survey, four months apart. A trend, not a contradiction.",
  },
  migration_budget: {
    values: { "DOC-3": "$120,000", "DOC-5": "$210,000" },
    kind: "methodological",
    note: "Eight days apart: one excludes staff time and one includes it.",
  },
  migration_duration: {
    values: { "DOC-2": "six weeks", "DOC-5": "ten weeks" },
    kind: "contradiction",
    note: "Neither document explains the difference: internal notes against an analyst's estimate, four days apart.",
  },
};
