import { createFileRoute, redirect } from "@tanstack/react-router";

/** The bulk import page moved into the order-based tracker. */
export const Route = createFileRoute("/admin/import")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/orders" });
  },
});
