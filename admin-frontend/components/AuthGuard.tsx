"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function AuthGuard({
  children,
  requireRoot = false,
}: {
  children: React.ReactNode;
  requireRoot?: boolean;
}) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading) {
      if (!isAuthenticated) {
        router.replace("/login");
      } else if (requireRoot && user?.role !== "ROOT_ADMIN") {
        router.replace("/?msg=unauthorized_desk");
      }
    }
  }, [mounted, loading, isAuthenticated, requireRoot, user, router]);

  if (!mounted || loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#14100E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#E8E2D2",
          fontFamily: "var(--font-body)",
          fontSize: "0.9rem",
          fontStyle: "italic",
        }}
      >
        ✦ Verifying editorial clearance...
      </div>
    );
  }

  if (!isAuthenticated || (requireRoot && user?.role !== "ROOT_ADMIN")) {
    return null;
  }

  return <>{children}</>;
}
