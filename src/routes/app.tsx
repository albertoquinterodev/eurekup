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

  // Single dynamic-viewport scroll container. Routes that need their own scroll
  // (e.g. chat room) render full-bleed via fixed positioning and bypass this scroll.
  return (
    <div className="relative h-dvh overflow-y-auto pb-24">
      <Outlet />
      <BottomNav />
    </div>
  );
}
