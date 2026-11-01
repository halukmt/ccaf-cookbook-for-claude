// Callers. Each failure has its own stable code in the wanted design.
import { errorResponse } from "./error-response.js";
export const notFound = () => errorResponse("Not found", 404);
export const rateLimited = () => errorResponse("Too many requests", 429);
