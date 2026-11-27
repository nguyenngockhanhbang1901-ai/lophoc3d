import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it('matches the 3D football-goal activity route', () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes('/activity-1');

    expect(matches.at(-1)?.routeId).toBe('/activity-1');
  });
  it("matches the online exam pages for teachers and students", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    expect(router.matchRoutes("/lop-thi").at(-1)?.routeId).toBe("/lop-thi");
    expect(router.matchRoutes("/hoc-sinh").at(-1)?.routeId).toBe("/hoc-sinh");
    expect(router.matchRoutes("/ngan-hang-de").at(-1)?.routeId).toBe("/ngan-hang-de");
    expect(router.matchRoutes("/ma-tran-de").at(-1)?.routeId).toBe("/ma-tran-de");
    expect(router.matchRoutes("/giao-bai").at(-1)?.routeId).toBe("/giao-bai");
  });
});
