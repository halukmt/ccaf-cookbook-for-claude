// The unauthenticated route.
import { displayName } from "../utils/format.js";

export const greeting = (request) => "Hello " + displayName(request.user);
