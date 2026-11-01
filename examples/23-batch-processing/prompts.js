// Prompt versions for the sample set. Later versions are written after reading the sample's real
// errors, which notes.md records.

export const SAMPLE_IDS = ["d01", "d06", "d09", "d12", "d16"];

export const PROMPTS = {
  v1: "Extract this document's data with the tool.",
  // After v1: how a receipt was paid went into payment_terms, and $ was not read as a currency.
  v2: "Extract this document's data with the tool. payment_terms means when payment is due, such as Net 30, and never how a payment was made. Read currency from symbols as well as codes: $ is USD, £ is GBP, € is EUR.",
};
