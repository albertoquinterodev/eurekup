import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="glass-strong h-2 w-2 animate-pulse rounded-full" />
      </div>
    );
  }

  // Container locked to dynamic viewport height. Each child route handles its own
  // internal scroll (chat list, drive, settings) so the bottom nav never overlaps
  // and content never escapes the viewport on mobile (iOS Safari URL bar safe).
  return (
    <div className="relative h-dvh overflow-hidden">
      <div className="h-full overflow-y-auto pb-24">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
