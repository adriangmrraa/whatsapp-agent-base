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
    if (stored === "true") {
      setCollapsed(true);
    }
    setMounted(true);
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
      <aside
        className="hidden w-64 flex-col border-r lg:flex transition-all duration-300 ease-in-out"
        style={{ backgroundColor: "#111111", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex h-14 items-center px-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <span className="text-base font-black tracking-tight" style={{ color: "rgba(255,255,255,0.9)" }}>
            WBB
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "hidden flex-col border-r lg:flex transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64"
      )}
      style={{ backgroundColor: "#111111", borderColor: "rgba(255,255,255,0.08)" }}
    >
      {/* Brand */}
      <Link
        href="/admin"
        className="flex h-14 items-center border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)", padding: collapsed ? "0 1rem" : "0 1.5rem" }}
      >
        <AnimatePresence mode="wait">
          {collapsed ? (
            <motion.span
              key="collapsed-brand"
              className="text-lg font-black tracking-tight w-full text-center"
              style={{ color: "rgba(255,255,255,0.9)" }}
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
              style={{ color: "rgba(255,255,255,0.9)" }}
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
                    item.disabled && "pointer-events-none opacity-40"
                  )}
                  style={
                    active
                      ? {
                          backgroundColor: "rgba(255,255,255,0.1)",
                          color: "#ffffff",
                        }
                      : { color: "rgba(255,255,255,0.4)" }
                  }
                  onMouseEnter={(e) => {
                    if (!active && !item.disabled) {
                      e.currentTarget.style.backgroundColor =
                        "rgba(255,255,255,0.05)";
                      e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active && !item.disabled) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "rgba(255,255,255,0.4)";
                    }
                  }}
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
      <div
        className="flex shrink-0 items-center justify-center p-2 border-t"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.4)" }}
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
