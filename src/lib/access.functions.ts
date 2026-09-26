import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DashboardAccess {
  isAdmin: boolean;
  /** Reviewer profiles this account may post on, e.g. ["afridi"] */
  reviewerKeys: string[];
  /** Extra dashboard sections this account may use, e.g. ["fake_reviews"] */
  sections: string[];
}

export const myDashboardAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardAccess> => {
    const [adminResult, editorResult, sectionResult] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase
        .from("reviewer_editors")
        .select("reviewer_key")
        .eq("user_id", context.userId),
      context.supabase
        .from("dashboard_section_grants")
        .select("section")
        .eq("user_id", context.userId),
    ]);

    if (adminResult.error) throw new Error(adminResult.error.message);

    return {
      isAdmin: Boolean(adminResult.data),
      reviewerKeys: (editorResult.data ?? []).map((row) => row.reviewer_key),
      sections: (sectionResult.data ?? []).map((row) => row.section),
    };
  });
