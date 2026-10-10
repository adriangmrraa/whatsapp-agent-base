"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    queueMicrotask(() => {
      if (stored === "true") setCollapsed(true);
      setMounted(true);
    });
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  if (!mounted) {
    return (
      <aside className="hidden w-64 flex-col border-r border-border lg:flex transition-all duration-300 ease-in-out bg-card">
        <div className="flex h-14 items-center px-6 border-b border-border">
          <span className="text-base font-black tracking-tight text-foreground">
            WBB
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "hidden flex-col border-r border-border lg:flex transition-all duration-300 ease-in-out bg-card",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand */}
      <Link
        href="/admin"
        className="flex h-14 items-center border-b border-border shrink-0 text-foreground"
        style={{ padding: collapsed ? "0 1rem" : "0 1.5rem" }}
      >
        <AnimatePresence mode="wait">
          {collapsed ? (
            <motion.span
              key="collapsed-brand"
              className="text-lg font-black tracking-tight w-full text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              W
            </motion.span>
          ) : (
            <motion.span
              key="expanded-brand"
              className="text-base font-black tracking-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              WBB
            </motion.span>
          )}
        </AnimatePresence>
      </Link>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <TooltipProvider delayDuration={0}>
          <nav className="flex flex-col gap-0.5 p-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              const linkEl = (
                <Link
                  href={item.disabled ? "#" : item.href}
                  aria-disabled={item.disabled}
                  tabIndex={item.disabled ? -1 : undefined}
                  className={cn(
                    "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                    collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                    item.disabled && "pointer-events-none opacity-40"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <AnimatePresence mode="wait">
                    {!collapsed && (
                      <motion.span
                        key={`label-${item.href}`}
                        className="overflow-hidden whitespace-nowrap"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.12 }}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return linkEl;
            })}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      {/* Collapse toggle */}
      <div className="flex shrink-0 items-center justify-center p-2 border-t border-border">
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-accent text-muted-foreground hover:text-accent-foreground"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
