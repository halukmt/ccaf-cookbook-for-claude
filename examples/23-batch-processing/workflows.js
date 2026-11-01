// Step 1's classification and step 4's arithmetic. Pure data and functions, no API.

export const WORKFLOWS = [
  { name: "Code review before a merge", type: "synchronous", waiting: "A developer, blocked until the check finishes", reason: "A wait of up to 24 hours stops the merge" },
  { name: "Live support chat", type: "synchronous", waiting: "A customer, in the conversation", reason: "Each reply is needed within seconds" },
  { name: "Technical debt report, weekly", type: "batch", waiting: "Nobody until Monday morning", reason: "Consumed days later, with time to absorb the window" },
  { name: "Test generation, each night", type: "batch", waiting: "Nobody until the next working day", reason: "Results go in a review queue" },
  { name: "Document extraction overnight", type: "batch", waiting: "A morning job, if the window is allowed for", reason: "No person waits, and volume benefits most from the discount" },
];

const HOUR = 3_600_000;

// A document that arrives just after a submission waits one full interval, then up to the full window.
export function maxIntervalHours(slaHours, windowHours = 24) {
  return slaHours - windowHours;
}

export function latestSubmission(deadline, slaHours) {
  return new Date(deadline.getTime() - slaHours * HOUR);
}

// Worst case for an arrival at any minute: an arrival at the moment of a submission just misses it,
// so it waits for the next one, then the full window.
export function worstCaseHours(intervalHours, windowHours = 24) {
  const intervalMinutes = intervalHours * 60;
  let worst = 0;
  for (let arrival = 0; arrival < intervalMinutes * 3; arrival++) {
    const nextSubmission = (Math.floor(arrival / intervalMinutes) + 1) * intervalMinutes;
    worst = Math.max(worst, nextSubmission - arrival + windowHours * 60);
  }
  return worst / 60;
}
