// A sample endpoint, here so a tool can read a file inside packages/api.
export function getUserProfile(request) {
  return { data: { id: request.params.id }, error: null, metadata: {} };
}
