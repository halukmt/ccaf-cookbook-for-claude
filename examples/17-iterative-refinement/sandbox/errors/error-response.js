// 1. What the API returns on failure.
export function errorResponse(message, status) {
  return { status, body: { message } };
}
