"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { fadeUpSmall, staggerContainer } from "@/lib/animations";

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  updateLeadAction,
  deleteLeadAction,
  type LeadRow,
  type LeadStatus,
  type CountsByStatus,
} from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadsClientProps {
  initialLeads: LeadRow[];
  initialTotalPages: number;
  initialCounts: CountsByStatus;
  currentStatus: string;
  currentPage: number;
  currentQ: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  converted: "Convertido",
  lost: "Perdido",
};

const STATUS_STYLES: Record<LeadStatus, { bg: string; color: string }> = {
  new: { bg: "rgba(59, 130, 246, 0.15)", color: "#93c5fd" },
  contacted: { bg: "rgba(148, 163, 184, 0.15)", color: "#cbd5e1" },
  converted: { bg: "rgba(34, 197, 94, 0.15)", color: "#86efac" },
  lost: { bg: "rgba(239, 68, 68, 0.15)", color: "#fca5a5" },
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Detail Field (readonly) ─────────────────────────────────────────────────

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
      <span className="text-sm break-words" style={{ color: "rgba(255,255,255,0.75)" }}>
        {value}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeadsClient({
  initialLeads,
  initialTotalPages,
  initialCounts,
  currentStatus,
  currentPage,
  currentQ,
}: LeadsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ────────────────────────────────────────────────────────────────

  const [leads, setLeads] = useState(initialLeads);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [counts, setCounts] = useState(initialCounts);

  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<LeadStatus>("new");

  // Search input state
  const [searchValue, setSearchValue] = useState(currentQ);

  // Sync form when selected lead changes
  useEffect(() => {
    if (selectedLead) {
      setEditName(selectedLead.name ?? "");
      setEditPhone(selectedLead.phone);
      setEditEmail(selectedLead.email ?? "");
      setEditNotes(selectedLead.notes ?? "");
      setEditStatus(selectedLead.status);
    }
  }, [selectedLead]);

  // ── URL helpers ──────────────────────────────────────────────────────────

  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(overrides).forEach(([key, value]) => {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      const qs = params.toString();
      return qs ? `/admin/leads?${qs}` : "/admin/leads";
    },
    [searchParams],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleStatusChange(value: string) {
    router.push(buildUrl({ status: value === "all" ? undefined : value, page: undefined }));
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(buildUrl({ q: searchValue || undefined, page: undefined }));
  }

  function handleSearchClear() {
    setSearchValue("");
    router.push(buildUrl({ q: undefined, page: undefined }));
  }

  function handlePrev() {
    if (currentPage <= 1) return;
    router.push(buildUrl({ page: String(currentPage - 1) }));
  }

  function handleNext() {
    if (currentPage >= totalPages) return;
    router.push(buildUrl({ page: String(currentPage + 1) }));
  }

  function openDetail(lead: LeadRow) {
    setSelectedLead(lead);
    setSheetOpen(true);
  }

  // ── Save / Delete ────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedLead) return;
    setSaving(true);
    try {
      await updateLeadAction(selectedLead.id, {
        name: editName || undefined,
        email: editEmail || undefined,
        notes: editNotes || undefined,
        status: editStatus,
      });
      setSheetOpen(false);
      router.refresh();
    } catch (err) {
      console.error("[handleSave] Error:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedLead) return;
    setDeleting(true);
    try {
      await deleteLeadAction(selectedLead.id);
      setSheetOpen(false);
      setDeleteOpen(false);
      router.refresh();
    } catch (err) {
      console.error("[handleDelete] Error:", err);
    } finally {
      setDeleting(false);
    }
  }

  const hasUnsavedChanges =
    selectedLead &&
    (editName !== (selectedLead.name ?? "") ||
      editEmail !== (selectedLead.email ?? "") ||
      editNotes !== (selectedLead.notes ?? "") ||
      editStatus !== selectedLead.status);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUpSmall} initial="hidden" animate="visible">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgba(255,255,255,0.9)" }}>
          Leads
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          {counts.total} contacto{counts.total !== 1 ? "s" : ""} registrado{counts.total !== 1 ? "s" : ""}
        </p>
      </motion.div>

      {/* ── Filters row ─────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUpSmall}
        initial="hidden"
        animate="visible"
        className="flex items-center gap-3 flex-wrap"
      >
        {/* Status filter */}
        <div className="w-44">
          <Select
            value={currentStatus || "all"}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                Todos ({counts.total})
              </SelectItem>
              <SelectItem value="new">
                Nuevo ({counts.new})
              </SelectItem>
              <SelectItem value="contacted">
                Contactado ({counts.contacted})
              </SelectItem>
              <SelectItem value="converted">
                Convertido ({counts.converted})
              </SelectItem>
              <SelectItem value="lost">
                Perdido ({counts.lost})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-xs">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "rgba(255,255,255,0.3)" }} />
            <Input
              placeholder="Buscar por nombre o teléfono..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchValue && (
              <button
                type="button"
                onClick={handleSearchClear}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Buscar
          </Button>
        </form>
      </motion.div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUpSmall}
        initial="hidden"
        animate="visible"
        className="rounded-lg overflow-hidden"
        style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead>Campaña</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  {currentQ
                    ? `No se encontraron leads para "${currentQ}"`
                    : "No hay leads para mostrar"}
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  onClick={() => openDetail(lead)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <TableCell className="font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
                    {lead.name ?? (
                      <span style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
                        Sin nombre
                      </span>
                    )}
                  </TableCell>
                  <TableCell style={{ color: "rgba(255,255,255,0.7)" }}>
                    {lead.phone}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell style={{ color: "rgba(255,255,255,0.6)" }}>
                    {lead.utmSource ?? lead.platform ?? (
                      <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
                    )}
                  </TableCell>
                  <TableCell style={{ color: "rgba(255,255,255,0.6)" }}>
                    {lead.utmCampaign ?? (
                      <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
                    )}
                  </TableCell>
                  <TableCell style={{ color: "rgba(255,255,255,0.4)" }}>
                    {formatDate(lead.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          Página{" "}
          <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
            {currentPage}
          </span>{" "}
          de{" "}
          <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
            {totalPages}
          </span>
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="size-4 mr-1" />
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentPage >= totalPages}
          >
            Siguiente
            <ChevronRight className="size-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* ── Detail Sheet ────────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto p-0"
          style={{ backgroundColor: "#111111", borderLeft: "1px solid #222222" }}
        >
          {selectedLead && (
            <>
              {/* ── Sheet Header ───────────────────────────────────────── */}
              <SheetHeader
                className="p-6 pb-4"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", backgroundColor: "rgba(0,0,0,0.2)" }}
              >
                <SheetTitle className="text-xl" style={{ color: "rgba(255,255,255,0.9)" }}>
                  {selectedLead.name ?? "Lead sin nombre"}
                </SheetTitle>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={editStatus} />
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                    ID #{selectedLead.id}
                  </span>
                </div>
              </SheetHeader>

              {/* ── Sheet Body ──────────────────────────────────────────── */}
              <div className="p-6 flex flex-col gap-6">
                {/* Contact Section (editable) */}
                <section className="flex flex-col gap-3">
                  <h3
                    className="text-xs font-semibold uppercase tracking-widest pb-1.5"
                    style={{ color: "rgba(255,255,255,0.4)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    Contacto
                  </h3>

                  {/* Name */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Nombre
                    </label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nombre del contacto"
                    />
                  </div>

                  {/* Phone */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Teléfono
                    </label>
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+549..."
                    />
                  </div>

                  {/* Email */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Email
                    </label>
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@ejemplo.com"
                    />
                  </div>

                  {/* Notes */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Notas
                    </label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Notas internas..."
                      rows={4}
                      className="flex w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      style={{
                        backgroundColor: "transparent",
                        borderColor: "rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.85)",
                      }}
                    />
                  </div>

                  {/* Status */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Estado
                    </label>
                    <Select value={editStatus} onValueChange={(v) => setEditStatus(v as LeadStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Nuevo</SelectItem>
                        <SelectItem value="contacted">Contactado</SelectItem>
                        <SelectItem value="converted">Convertido</SelectItem>
                        <SelectItem value="lost">Perdido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </section>

                {/* Attribution (readonly) */}
                <section className="flex flex-col gap-3">
                  <h3
                    className="text-xs font-semibold uppercase tracking-widest pb-1.5"
                    style={{ color: "rgba(255,255,255,0.4)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    Atribución
                  </h3>
                  <DetailField label="Código de referido" value={selectedLead.refCode} />
                  <DetailField label="Plataforma" value={selectedLead.platform} />
                  <DetailField label="UTM Source" value={selectedLead.utmSource} />
                  <DetailField label="UTM Medium" value={selectedLead.utmMedium} />
                  <DetailField label="UTM Campaign" value={selectedLead.utmCampaign} />
                  <DetailField label="UTM Content" value={selectedLead.utmContent} />
                </section>

                {/* Campaign IDs (readonly) */}
                <section className="flex flex-col gap-3">
                  <h3
                    className="text-xs font-semibold uppercase tracking-widest pb-1.5"
                    style={{ color: "rgba(255,255,255,0.4)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    IDs de campaña
                  </h3>
                  <DetailField label="Ad ID" value={selectedLead.adId} />
                  <DetailField label="Campaign ID" value={selectedLead.campaignId} />
                  <DetailField label="Adset ID" value={selectedLead.adsetId} />
                  <DetailField label="Conversación ID" value={selectedLead.conversationId} />
                </section>

                {/* Actions */}
                <div className="flex flex-col gap-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {/* Save */}
                  <Button
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges || saving}
                    className="w-full"
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </Button>

                  {/* Delete */}
                  <Button
                    variant="outline"
                    onClick={() => setDeleteOpen(true)}
                    className="w-full"
                    style={{
                      borderColor: "rgba(239, 68, 68, 0.2)",
                      color: "rgba(248, 113, 113, 0.8)",
                    }}
                  >
                    <Trash2 className="size-4 mr-2" />
                    Eliminar lead
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Delete Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "rgba(255,255,255,0.9)" }}>
              ¿Eliminar lead?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el
              lead{" "}
              <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                {selectedLead?.name ?? selectedLead?.phone}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
