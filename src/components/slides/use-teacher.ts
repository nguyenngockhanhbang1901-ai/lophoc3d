import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** The signed-in teacher: undefined while checking, null when signed out. Follows sign-in and sign-out. */
export function useTeacher(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    const refresh = () => {
      // Show the page at once from the stored session, then confirm with the server.
      // Data stays protected by RLS and server checks either way; this only decides what to render.
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) setUser((u) => u ?? data.session!.user);
      });
      void supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    };
    refresh();
    window.addEventListener("classroom-auth-changed", refresh);
    return () => window.removeEventListener("classroom-auth-changed", refresh);
  }, []);
  return user;
}
