// Server relay for the homeroom AI drafts. The teacher's Gemini key is used for this request only:
// never stored, returned or logged; the prompt is already anonymous (see ai.ts).
import { createServerFn } from "@tanstack/react-start";
import { requireOwner } from "@/lib/owner-middleware";
import { aiInput, requestHomeroomAi } from "./ai";

export const writeWithAi = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((input: unknown) => aiInput.parse(input))
  .handler(({ data }) => requestHomeroomAi(data.apiKey, data.task, data.prompt));
