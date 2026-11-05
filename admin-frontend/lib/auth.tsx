"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminUser, AuthResponse } from "./types";
import { api } from "./client";

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<AuthResponse>;
  setup: (email: string, pass: string, name?: string, setupCode?: string) => Promise<AuthResponse>;
  logout: () => void;
  isAuthenticated: boolean;
}

export const DEFAULT_ROOT_ADMIN: AdminUser = {
  id: "admin-root",
  email: "root@tam.vit.ac.in",
  role: "ROOT_ADMIN",
  domain: null,
  name: "Arthur Pendelton",
};
export const DEFAULT_TOKEN = "mock-jwt-token-admin-root";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("admin_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("admin_token");
  });
  const [loading] = useState(false);
  const router = useRouter();

  const saveAuth = (authRes: AuthResponse) => {
    const adminUser: AdminUser = {
      id: authRes.id,
      email: authRes.email,
      role: authRes.role,
      domain: authRes.domain,
      name: authRes.name,
    };
    localStorage.setItem("admin_token", authRes.token);
    localStorage.setItem("admin_user", JSON.stringify(adminUser));
    setToken(authRes.token);
    setUser(adminUser);
  };

  const login = async (email: string, pass: string): Promise<AuthResponse> => {
    const res = await api.login(email, pass);
    saveAuth(res);
    return res;
  };

  const setup = async (email: string, pass: string, name?: string, setupCode?: string): Promise<AuthResponse> => {
    const res = await api.setup(email, pass, name, setupCode);
    saveAuth(res);
    return res;
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    setToken(null);
    setUser(null);
    router.push("/login?msg=logged_out");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        setup,
        logout,
        isAuthenticated: !!token && !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
