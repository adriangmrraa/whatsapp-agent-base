export default function ConversationsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 min-h-[60vh]">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
          Conversaciones
        </h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          Próximamente — inbox de conversaciones con búsqueda, filtros y chat en vivo.
        </p>
      </div>
    </div>
  );
}
