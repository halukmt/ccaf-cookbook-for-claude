// Rejects a request unless it carries a known bearer token.
export function requireUser(tokens) {
  return (request, response, next) => {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const user = token ? tokens.get(token) : null;
    if (!user) {
      response.statusCode = 401;
      return response.end("Unauthorized");
    }
    if (user.disabled) {
      response.statusCode = 403;
      return response.end("Forbidden");
    }
    request.user = user;
    return next();
  };
}
