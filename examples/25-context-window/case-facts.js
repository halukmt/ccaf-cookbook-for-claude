// Case facts, prompt construction, trimming and aggregation. No model calls here, so all of it runs free.

const dropUndefined = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

// Copies values verbatim. They must never be reformatted: a rounded amount is a wrong amount.
export function extractCaseFacts(toolResult) {
  const issue = {
    orderId: toolResult.order_id,
    orderDate: toolResult.order_date,
    orderTotal: toolResult.total_amount,
    status: toolResult.status,
    itemDescription: toolResult.item_description,
    rmaId: toolResult.rma_id,
    restockingFee: toolResult.restocking_fee,
    netRefund: toolResult.net_refund,
    refundDueDate: toolResult.refund_due_date,
  };
  return {
    customerId: toolResult.customer_id,
    issues: toolResult.order_id ? [dropUndefined(issue)] : [],
  };
}

// Facts from later tool calls join the same issue instead of replacing the block.
export function mergeCaseFacts(existing, incoming) {
  const merged = { customerId: existing?.customerId ?? incoming.customerId, issues: [...(existing?.issues ?? [])] };
  for (const issue of incoming.issues) {
    const index = merged.issues.findIndex((known) => known.orderId === issue.orderId);
    if (index === -1) merged.issues.push(issue);
    else merged.issues[index] = { ...merged.issues[index], ...issue };
  }
  return merged;
}

export const CASE_FACTS_HEADER = "## Active Case Facts (DO NOT SUMMARISE)";

// `recentTurns` holds whatever happened since the last summary. Null facts leave the block out, since
// interpolating them would print the word "null" under the header.
export function buildPrompt(caseFacts, summarisedHistory, currentMessage, recentTurns = []) {
  const block = caseFacts ? `${CASE_FACTS_HEADER}\n${JSON.stringify(caseFacts, null, 2)}\n\n` : "";
  return [
    { role: "user", content: `${block}## Conversation summary\n${summarisedHistory}` },
    { role: "assistant", content: caseFacts ? "I have the case facts and history." : "I have the history." },
    ...recentTurns,
    { role: "user", content: currentMessage },
  ];
}

export const REFUND_FIELDS = ["order_id", "order_date", "total_amount", "return_eligible", "item_description"];
export const RETURN_FIELDS = ["order_id", "rma_id", "restocking_fee", "net_refund", "refund_due_date"];

export function trimToolResult(rawResult, relevantFields = REFUND_FIELDS) {
  return Object.fromEntries(Object.entries(rawResult).filter(([key]) => relevantFields.includes(key)));
}

export function aggregateWithKeyFindings(sources) {
  const highlights = sources.map((source) => `- ${source.name}: ${source.keyClaim}`);
  return `## Key findings at a glance\n${highlights.join("\n")}\n\n## Full findings\n\n` +
    sources.map((source) => `### ${source.name}\n${source.fullContent}`).join("\n\n");
}

export function aggregateFlat(sources) {
  return sources.map((source) => `### ${source.name}\n${source.fullContent}`).join("\n\n");
}
