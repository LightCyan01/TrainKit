import { useState, useEffect, memo } from "react";
import { Logo } from "./shared/Logo";

export const Header = memo(function Header() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <header className="relative border-b border-border bg-dark/80 backdrop-blur-sm">
      <div className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary to-transparent" />

      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Logo className="h-10 w-10" />
          </div>

          <div className="flex flex-col">
            <h1 className="text-xl font-semibold tracking-wider text-foreground">
              TRAINKIT
            </h1>
            <span className="text-[10px] font-medium tracking-[0.3em] text-muted-foreground uppercase">
              Image Processing Terminal
            </span>
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
            System Status
          </span>
          <span className="font-mono text-sm text-foreground">
            {currentTime.toLocaleTimeString("en-US", { hour12: false })}
          </span>
        </div>
      </div>
    </header>
  );
});

