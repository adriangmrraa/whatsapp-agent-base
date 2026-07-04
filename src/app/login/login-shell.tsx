"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer, cardEntrance } from "@/lib/animations";
import LoginForm from "./login-form";

export default function LoginShell() {
  return (
    <motion.div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ background: "#0a0a0a" }}
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Dark glow background layers */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Primary ambient glow — top center */}
        <div
          className="absolute -top-32 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, #D4A017 0%, #E8712A 40%, transparent 70%)",
          }}
        />
        {/* Secondary glow — bottom */}
        <div
          className="absolute bottom-0 left-1/2 h-[400px] w-[500px] -translate-x-1/2 rounded-full opacity-10 blur-[100px]"
          style={{
            background: "radial-gradient(circle, #8B0000 0%, transparent 70%)",
          }}
        />
        {/* Subtle noise texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
            backgroundSize: "200px 200px",
          }}
        />
      </div>

      {/* Animated orb behind the card */}
      <motion.div
        className="pointer-events-none absolute"
        style={{
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(212,160,23,0.18) 0%, rgba(232,113,42,0.08) 40%, transparent 70%)",
          filter: "blur(40px)",
          top: "50%",
          left: "50%",
          x: "-50%",
          y: "-50%",
        }}
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Content */}
      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <motion.div className="mb-8 text-center" variants={fadeUp}>
          <h1 className="text-4xl font-black tracking-tight"
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              background: "linear-gradient(135deg, #D4A017, #F5A623, #E8712A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            WhatsApp Business Base
          </h1>
          <p
            className="mt-2 text-sm font-medium uppercase tracking-[0.25em]"
            style={{ color: "rgba(245,245,220,0.45)" }}
          >
            Panel de Administración
          </p>
          {/* Gold accent line */}
          <div
            className="mx-auto mt-3 h-px w-16 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, #D4A017, transparent)",
            }}
          />
        </motion.div>

        {/* Glass card */}
        <motion.div
          className="rounded-2xl border p-8"
          variants={cardEntrance}
          style={{
            background: "rgba(17,17,17,0.85)",
            borderColor: "rgba(212,160,23,0.3)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(212,160,23,0.05) inset",
          }}
        >
          <h2
            className="mb-6 text-lg font-semibold"
            style={{ color: "rgba(245,245,220,0.85)" }}
          >
            Iniciá sesión
          </h2>
          <LoginForm />
        </motion.div>

        {/* Footer */}
        <motion.p
          className="mt-6 text-center text-xs"
          style={{ color: "rgba(245,245,220,0.25)" }}
          variants={fadeUp}
        >
          Acceso restringido al personal autorizado
        </motion.p>
      </div>
    </motion.div>
  );
}
