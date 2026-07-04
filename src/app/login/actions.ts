"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export type LoginActionResult = {
  success: boolean;
  error: string | null;
};

export async function loginAction(
  _prev: LoginActionResult,
  formData: FormData,
): Promise<LoginActionResult> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Email o contraseña inválidos." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        success: false,
        error: "Credenciales incorrectas. Verificá tu email y contraseña.",
      };
    }
    throw err;
  }

  redirect("/admin");
}
