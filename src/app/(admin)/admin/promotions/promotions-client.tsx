"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  createPromotionAction,
  updatePromotionAction,
  deletePromotionAction,
  togglePromotionActiveAction,
  type PaginatedResult,
  type PromoRow,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fadeUpSmall } from "@/lib/animations";

// ─── Constants ──────────────────────────────────────────────────────────────

const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(value: string | null): string | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : CURRENCY_FORMAT.format(n);
}

// ─── Promo Form (shared between create and edit) ───────────────────────────

function PromoForm({
  promo,
  onClose,
  onSaved,
}: {
  promo?: PromoRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(promo?.name ?? "");
  const [description, setDescription] = useState(promo?.description ?? "");
  const [customPrice, setCustomPrice] = useState(promo?.customPrice ?? "");
  const [imageUrl, setImageUrl] = useState(promo?.imageUrl ?? "");
  const [active, setActive] = useState(promo?.active ?? true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const data = {
        name,
        description: description || undefined,
        customPrice: customPrice ? Number(customPrice) : undefined,
        imageUrl: imageUrl || undefined,
        active,
      };

      const result = promo
        ? await updatePromotionAction(promo.id, data)
        : await createPromotionAction(data);

      if (result.success) {
        onSaved();
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Name */}
      <div>
        <label
          htmlFor="promo-name"
          className="text-xs text-muted-foreground mb-1.5 block"
        >
          Name *
        </label>
        <Input
          id="promo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Promotion name"
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="promo-desc"
          className="text-xs text-muted-foreground mb-1.5 block"
        >
          Description
        </label>
        <textarea
          id="promo-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description..."
          rows={3}
          className="flex w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>

      {/* Custom Price */}
      <div>
        <label
          htmlFor="promo-price"
          className="text-xs text-muted-foreground mb-1.5 block"
        >
          Custom Price
        </label>
        <Input
          id="promo-price"
          value={customPrice}
          onChange={(e) => setCustomPrice(e.target.value)}
          placeholder="0.00"
          type="number"
          step="0.01"
          min="0"
        />
      </div>

      {/* Image URL */}
      <div>
        <label
          htmlFor="promo-image"
          className="text-xs text-muted-foreground mb-1.5 block"
        >
          Image URL
        </label>
        <Input
          id="promo-image"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
        />
        {imageUrl && (
          <div className="mt-2 flex items-center gap-2">
            <img
              src={imageUrl}
              alt=""
              className="w-12 h-12 object-cover rounded-md border border-border"
            />
            <span className="text-[10px] text-muted-foreground truncate flex-1">
              {imageUrl}
            </span>
          </div>
        )}
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <Switch
          checked={active}
          onCheckedChange={setActive}
          id="promo-form-active"
        />
        <label
          htmlFor="promo-form-active"
          className="text-sm text-muted-foreground cursor-pointer select-none"
        >
          Active
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim() || saving}
        >
          {saving ? "Saving..." : promo ? "Save Changes" : "Create"}
        </Button>
      </div>
    </div>
  );
}

// ─── Promo Card ─────────────────────────────────────────────────────────────

function PromoCard({
  promo,
  onEdit,
  onDeleted,
}: {
  promo: PromoRow;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [optimisticActive, setOptimisticActive] = useState(promo.active);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();

  const handleToggle = async (checked: boolean) => {
    const prev = optimisticActive;
    setOptimisticActive(checked);
    const result = await togglePromotionActiveAction(promo.id, checked);
    if (!result.success) {
      setOptimisticActive(prev);
    }
    router.refresh();
  };

  const priceDisplay = formatPrice(promo.customPrice);
  const isActive = optimisticActive;

  return (
    <motion.div
      variants={fadeUpSmall}
      initial="hidden"
      animate="visible"
      className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-border/80 transition-colors"
    >
      {/* Top row: name + status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground truncate">
          {promo.name}
        </span>
        <Badge
          variant={isActive ? "default" : "secondary"}
          className="shrink-0 text-[10px] h-5 capitalize"
        >
          {isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Description */}
      {promo.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {promo.description}
        </p>
      )}

      {/* Price + Image row */}
      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <div className="flex-1 min-w-0">
          {priceDisplay && (
            <span className="text-sm font-mono text-foreground/80">
              {priceDisplay}
            </span>
          )}
        </div>
        {promo.imageUrl && (
          <img
            src={promo.imageUrl}
            alt=""
            className="w-10 h-10 object-cover rounded-md border border-border shrink-0"
          />
        )}
      </div>

      {/* Bottom row: switch toggle + action buttons */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
        <div className="flex items-center gap-2">
          <Switch
            checked={optimisticActive}
            onCheckedChange={handleToggle}
            className="scale-75 origin-left"
          />
          <span className="text-[10px] text-muted-foreground">Active</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-7 text-xs px-2"
          >
            Edit
          </Button>

          {confirmingDelete ? (
            <div className="flex items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onDeleted();
                  setConfirmingDelete(false);
                }}
                className="h-7 text-xs px-2"
              >
                Confirm
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
                className="h-7 text-xs px-2"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              className="h-7 text-xs px-2 text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────

function PaginationBar({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 pt-4">
      <Link
        href={page > 1 ? `/admin/promotions?page=${page - 1}` : "#"}
        className={`inline-flex items-center gap-1 text-sm h-8 px-3 rounded-lg border border-border transition-colors ${
          page <= 1
            ? "pointer-events-none opacity-30"
            : "hover:bg-accent hover:text-accent-foreground"
        }`}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
      >
        <ChevronLeft className="size-3.5" />
        Previous
      </Link>

      <span className="text-sm text-muted-foreground tabular-nums">
        {page} / {totalPages}
      </span>

      <Link
        href={
          page < totalPages
            ? `/admin/promotions?page=${page + 1}`
            : "#"
        }
        className={`inline-flex items-center gap-1 text-sm h-8 px-3 rounded-lg border border-border transition-colors ${
          page >= totalPages
            ? "pointer-events-none opacity-30"
            : "hover:bg-accent hover:text-accent-foreground"
        }`}
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
      >
        Next
        <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}

// ─── Main Client Component ──────────────────────────────────────────────────

export function PromotionsClient({
  initialData,
}: {
  initialData: PaginatedResult;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PromoRow | null>(null);
  const router = useRouter();

  const handleDelete = async (id: number) => {
    await deletePromotionAction(id);
    router.refresh();
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Promotions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your promotional offers
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Promotion</Button>
      </div>

      {/* Empty state */}
      {initialData.promotions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <span className="text-lg text-muted-foreground">%</span>
          </div>
          <p className="text-sm text-muted-foreground">No promotions yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create your first promotion to get started.
          </p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {initialData.promotions.map((p) => (
            <PromoCard
              key={p.id}
              promo={p}
              onEdit={() => setEditing(p)}
              onDeleted={() => handleDelete(p.id)}
            />
          ))}
        </motion.div>
      )}

      {/* Pagination */}
      <PaginationBar
        page={initialData.page}
        totalPages={initialData.totalPages}
      />

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Promotion</DialogTitle>
          </DialogHeader>
          <PromoForm
            onClose={() => setShowCreate(false)}
            onSaved={() => {
              setShowCreate(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Promotion</DialogTitle>
          </DialogHeader>
          {editing && (
            <PromoForm
              promo={editing}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
