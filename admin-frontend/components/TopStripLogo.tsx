"use client";

import React from "react";
import Image from "next/image";

interface TopStripLogoProps {
  className?: string;
}

export function TopStripLogo({ className = "" }: TopStripLogoProps) {
  return (
    <div className={`admin-top-strip-logo ${className}`} style={{ width: "100%", flexShrink: 0 }}>
      {/* THE TAM LOGO IS LOCKED: do not move, resize, restyle or change the height of the top strip that holds it on any page */}
      {/* Top double rule */}
      <hr className="rule-double" style={{ margin: "0 0 0.5rem 0" }} />

      {/* Centred Logo alone in strip, height 48px to 64px, whole and uncropped */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "64px",
          margin: "0.25rem 0",
          lineHeight: 0,
        }}
      >
        <Image
          src="/images/logo.png"
          alt="The AI & ML Club Logo"
          width={135}
          height={131}
          priority
          style={{
            height: "56px",
            width: "auto",
            maxHeight: "56px",
            objectFit: "contain",
            display: "block",
            mixBlendMode: "multiply",
            opacity: 0.95,
          }}
        />
      </div>

      {/* Bottom double rule */}
      <hr className="rule-double" style={{ margin: "0.5rem 0 0.75rem 0" }} />
    </div>
  );
}
