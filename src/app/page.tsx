export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">WhatsApp Business Base</h1>
        <p className="text-muted-foreground text-lg">
          Plataforma de WhatsApp + IA para tu negocio
        </p>
        <a
          href="/login"
          className="inline-block mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Iniciar sesión
        </a>
      </div>
    </main>
  );
}
