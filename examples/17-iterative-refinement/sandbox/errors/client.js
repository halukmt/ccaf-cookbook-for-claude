// 3. What the client SDK exposes on failure.
export class ApiError extends Error {
  constructor(body, status) {
    super(body.message);
    this.status = status;
  }
}
