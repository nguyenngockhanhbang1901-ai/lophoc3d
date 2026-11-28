// Server side of the personal-website lock: every teacher server function runs this instead of
// requireSupabaseAuth directly, so a signed-in account that is not the owner gets nothing done.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isOwnerEmail, NOT_OWNER_MESSAGE } from "./site-owner";

export const requireOwner = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!isOwnerEmail(email)) throw new Error(NOT_OWNER_MESSAGE);
    return next();
  });
