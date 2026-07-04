export default function OrdersPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 min-h-[60vh]">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
          Pedidos
        </h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          Próximamente — historial y gestión de pedidos con filtros y acciones.
        </p>
      </div>
    </div>
  );
}
