import { memo } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

export const Logo = memo(function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("text-primary", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" />
      <path d="M24 12L34 18V30L24 36L14 30V18L24 12Z" />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
      <line x1="24" y1="20" x2="24" y2="12" strokeWidth="1" />
      <line x1="27.5" y1="22" x2="34" y2="18" strokeWidth="1" />
      <line x1="27.5" y1="26" x2="34" y2="30" strokeWidth="1" />
      <line x1="24" y1="28" x2="24" y2="36" strokeWidth="1" />
      <line x1="20.5" y1="26" x2="14" y2="30" strokeWidth="1" />
      <line x1="20.5" y1="22" x2="14" y2="18" strokeWidth="1" />
    </svg>
  );
});
