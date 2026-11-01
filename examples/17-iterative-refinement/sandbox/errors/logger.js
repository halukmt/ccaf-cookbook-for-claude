// 2. What gets logged on failure. Structured JSON, one line each.
export function logError(response) {
  return JSON.stringify({ level: "error", message: response.body.message, status: response.status });
}
