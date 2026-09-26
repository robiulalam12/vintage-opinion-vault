import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, Inbox, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { NewOrderDialog } from "@/components/admin/NewOrderDialog";
import { Button } from "@/components/ui/button";
import { deleteReviewOrder, listReviewOrders, type ReviewOrder } from "@/lib/reviews.functions";

export const Route = createFileRoute("/admin/orders/")({
  component: OrdersPage,
});

function ProgressBar({ value, total }: { value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {value} of {total} fetched · {percent}%
      </p>
    </div>
  );
}

function OrderCard({ order, onRefresh }: { order: ReviewOrder; onRefresh: () => void }) {
  const remove = useServerFn(deleteReviewOrder);

  return (
    <div className="press-panel flex flex-col gap-4 p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg text-foreground">{order.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {new Date(order.created_at).toLocaleDateString()}
            {order.note ? ` · ${order.note}` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Delete order"
          className="shrink-0"
          onClick={async () => {
            if (!window.confirm(`Delete "${order.name}" and its links?`)) return;
            try {
              await remove({ data: { id: order.id } });
              toast.success("Order deleted");
              onRefresh();
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      <ProgressBar value={order.fetched} total={order.total} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="pill border-primary/30 text-primary">
          {order.reviewer_key === "jonas" ? "Jonas Weber" : order.reviewer_key === "benedikt" ? "Benedikt Herrmann" : "Robiul Alam"}
        </span>
        <span className="pill">{order.total} links</span>
        <span className="pill">{order.published} live</span>
        {order.failed ? (
          <span className="pill border-destructive/30 text-destructive">{order.failed} failed</span>
        ) : null}
      </div>

      <Button asChild variant="outline" className="w-full rounded-full">
        <Link to="/admin/orders/$orderId" params={{ orderId: order.id }}>
          Open order <ArrowRight className="ml-2 size-4" />
        </Link>
      </Button>
    </div>
  );
}

function OrdersPage() {
  const queryClient = useQueryClient();
  const loadOrders = useServerFn(listReviewOrders);
  const [dialogOpen, setDialogOpen] = useState(false);

  const ordersQuery = useQuery({ queryKey: ["review-orders"], queryFn: () => loadOrders() });
  const orders = ordersQuery.data ?? [];
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["review-orders"] });

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Review tracker"
        title="Review orders"
        description="Group review links into named orders, fetch the full review text for each one, then publish them on the reviewer profile chosen for the order."
        actions={
          <Button type="button" className="rounded-full" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 size-4" /> New order
          </Button>
        }
      />

      {ordersQuery.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading orders…</p>
      ) : orders.length === 0 ? (
        <div className="press-panel mt-8 flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <h2 className="font-display text-lg">No orders yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create your first order, paste the Google review links, and the tracker takes it from
            there.
          </p>
          <Button type="button" className="mt-1 rounded-full" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 size-4" /> New order
          </Button>
        </div>
      ) : (
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onRefresh={refresh} />
          ))}
        </div>
      )}

      <NewOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={refresh} />
    </div>
  );
}
