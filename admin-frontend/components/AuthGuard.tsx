"use client";

import React from "react";

export function AuthGuard({
  children,
}: {
  children: React.ReactNode;
  requireRoot?: boolean;
}) {
  return <>{children}</>;
}
