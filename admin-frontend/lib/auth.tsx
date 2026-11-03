"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AdminUser, AdminRole, DomainEnum, AuthResponse } from "./types";
import { api } from "./client";

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<AuthResponse>;
  setup: (email: string, pass: string, name?: string) => Promise<AuthResponse>;
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
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem("admin_token");
      const storedUser = localStorage.getItem("admin_user");
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error("Failed to parse stored auth", e);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const setup = async (email: string, pass: string, name?: string): Promise<AuthResponse> => {
    const res = await api.setup(email, pass, name);
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
