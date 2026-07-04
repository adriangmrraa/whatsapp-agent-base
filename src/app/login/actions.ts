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
  error?: string;
  errors?: Record<string, string[]>;
  values?: { email?: string };
};

export async function loginAction(
  _prev: LoginActionResult,
  formData: FormData,
): Promise<LoginActionResult> {
  const rawEmail = (formData.get("email") as string) ?? "";

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      success: false,
      errors: fieldErrors,
      values: { email: rawEmail },
    };
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
        error: "Credenciales incorrectas",
        values: { email: parsed.data.email },
      };
    }
    throw err;
  }

  redirect("/admin");
}
