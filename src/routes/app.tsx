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

  // Full dynamic viewport, scrollable inner content, fixed bottom nav padding.
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-28">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
