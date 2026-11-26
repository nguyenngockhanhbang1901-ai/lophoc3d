import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** The signed-in teacher: undefined while checking, null when signed out. Follows sign-in and sign-out. */
export function useTeacher(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    const refresh = () => {
      void supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    };
    refresh();
    window.addEventListener("classroom-auth-changed", refresh);
    return () => window.removeEventListener("classroom-auth-changed", refresh);
  }, []);
  return user;
}
