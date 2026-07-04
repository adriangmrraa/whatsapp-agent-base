"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { navItems } from "./nav-items";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TopbarProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return "A";
}

function MobileSidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "#111111" }}>
      <div
        className="flex h-14 items-center justify-between px-4 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <span className="text-base font-black tracking-tight" style={{ color: "rgba(255,255,255,0.9)" }}>
          WBB
        </span>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.4)" }}
          aria-label="Cerrar menú"
        >
          <X className="size-4" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-0.5 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.disabled ? "#" : item.href}
                aria-disabled={item.disabled}
                tabIndex={item.disabled ? -1 : undefined}
                onClick={onClose}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
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
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}

export default function AdminTopbar({ user }: TopbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = getInitials(user.name, user.email);
  const displayName = user.name ?? user.email ?? "Admin";

  return (
    <>
      <motion.header
        className="flex h-14 shrink-0 items-center gap-3 px-4 relative z-10"
        style={{
          backgroundColor: "#0a0a0a",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
          <span className="sr-only">Abrir menú</span>
        </Button>

        <div className="flex-1" />

        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium leading-none" style={{ color: "rgba(255,255,255,0.9)" }}>
              {displayName}
            </span>
            <span className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {user.email}
            </span>
          </div>

          <Avatar className="size-8">
            <AvatarFallback
              style={{
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.7)",
                fontWeight: 700,
                fontSize: "0.75rem",
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Cerrar sesión"
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
            <span className="sr-only">Cerrar sesión</span>
          </Button>
        </div>
      </motion.header>

      {/* Mobile sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Overlay */}
            <motion.div
              className="fixed inset-0 z-40 lg:hidden"
              style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />

            {/* Sheet panel */}
            <motion.div
              className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <MobileSidebarContent onClose={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
