import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <h1
          className="text-6xl font-black tracking-tight"
          style={{ color: "rgba(255,255,255,0.1)" }}
        >
          404
        </h1>
        <h2 className="text-xl font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
          Página no encontrada
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          La sección que buscás no existe o fue movida.
        </p>
        <Link
          href="/admin"
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:opacity-90"
          style={{
            backgroundColor: "rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.8)",
          }}
        >
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
