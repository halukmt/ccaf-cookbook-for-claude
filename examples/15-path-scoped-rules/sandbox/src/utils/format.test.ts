import { format } from "./format";
it("trims", () => { if (format(" a ") !== "a") throw new Error("no"); });
