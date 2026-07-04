"use client";

import { useActionState, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loginAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircleIcon, LoaderIcon } from "lucide-react";
import { staggerContainer, fadeUpSmall } from "@/lib/animations";
import type { LoginActionResult } from "./actions";

const initialState: LoginActionResult = { success: false };

const GOLD_FOCUS_SHADOW =
  "0 0 0 2px rgba(212,160,23,0.25), 0 0 12px rgba(212,160,23,0.12)";

function GoldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);

  return (
    <Input
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={{
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        boxShadow: focused ? GOLD_FOCUS_SHADOW : undefined,
        borderColor: focused
          ? "rgba(212,160,23,0.6)"
          : "rgba(212,160,23,0.15)",
      }}
    />
  );
}

export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <motion.form
      action={formAction}
      className="flex flex-col gap-4"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Email field */}
      <motion.div className="flex flex-col gap-1.5" variants={fadeUpSmall}>
        <Label htmlFor="email" style={{ color: "rgba(245,245,220,0.7)" }}>
          Email
        </Label>
        <GoldInput
          id="email"
          name="email"
          type="email"
          placeholder="admin@ejemplo.com"
          required
          autoComplete="email"
          defaultValue={state.values?.email ?? ""}
        />
        {state.errors?.email?.[0] && (
          <p className="text-xs text-red-400 mt-1">{state.errors.email[0]}</p>
        )}
      </motion.div>

      {/* Password field */}
      <motion.div className="flex flex-col gap-1.5" variants={fadeUpSmall}>
        <Label htmlFor="password" style={{ color: "rgba(245,245,220,0.7)" }}>
          Contraseña
        </Label>
        <GoldInput
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
        {state.errors?.password?.[0] && (
          <p className="text-xs text-red-400 mt-1">{state.errors.password[0]}</p>
        )}
      </motion.div>

      {/* Error message */}
      <AnimatePresence mode="wait">
        {state?.error && (
          <motion.div
            key="error"
            variants={fadeUpSmall}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              background: "rgba(139,0,0,0.15)",
              border: "1px solid rgba(139,0,0,0.4)",
              color: "#ff6b6b",
            }}
          >
            <AlertCircleIcon className="size-4 shrink-0" />
            <span>{state.error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit button */}
      <motion.div variants={fadeUpSmall} className="mt-2">
        <motion.div
          whileHover={{ scale: isPending ? 1 : 1.02 }}
          whileTap={{ scale: isPending ? 1 : 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          <Button
            type="submit"
            disabled={isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-widest"
            style={{
              background:
                "linear-gradient(135deg, #D4A017, #F5A623, #E8712A)",
              color: "#0a0a0a",
            }}
          >
            {isPending ? (
              <motion.span
                className="flex items-center gap-2"
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <LoaderIcon className="size-4 animate-spin" />
                Ingresando…
              </motion.span>
            ) : (
              "Ingresar"
            )}
          </Button>
        </motion.div>
      </motion.div>
    </motion.form>
  );
}
