import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/TickerToast";

export const metadata: Metadata = {
  title: "The TAM Times — The Editor's Desk",
  description: "Recruitment Administration Portal for Domain Heads and Root Admin",
  robots: {
    index: false, // noindex
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="build-id" content={process.env.NEXT_PUBLIC_BUILD_ID || ""} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
