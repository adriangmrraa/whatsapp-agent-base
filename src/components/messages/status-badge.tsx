import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  mode: "ai" | "human" | "new" | "stale";
  className?: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; bg: string; text: string }
> = {
  ai: {
    label: "IA Activo",
    dot: "bg-blue-400",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
  },
  human: {
    label: "Modo Humano",
    dot: "bg-amber-400",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
  },
  new: {
    label: "Nuevo",
    dot: "bg-emerald-400",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
  },
  stale: {
    label: "Inactivo",
    dot: "bg-neutral-500",
    bg: "bg-white/5",
    text: "text-neutral-400",
  },
};

export function StatusBadge({ mode, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[mode] ?? STATUS_CONFIG.stale;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        config.bg,
        config.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
