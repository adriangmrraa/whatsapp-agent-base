import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import type { JWT } from "@auth/core/jwt";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email);
        const password = String(credentials.password);

        const record = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (!record) {
          return null;
        }

        const isValid = await bcrypt.compare(password, record.hashedPassword);
        if (!isValid) {
          return null;
        }

        return {
          id: String(record.id),
          email: record.email,
          name: record.name,
          role: record.role,
          tenantId: record.tenantId,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // user.id from Credentials authorize is always a string — TS doesn't
        // know that, so we guard with a fallback.
        const uid = user.id ? parseInt(user.id, 10) : 0;
        token.id = uid;
        token.role = (user as { role: "owner" | "admin" | "viewer" }).role;
        token.tenantId = (user as { tenantId?: number }).tenantId ?? 0;
      }
      return token as JWT;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id: number }).id = (token as JWT & { id: number }).id;
        (session.user as { role: "owner" | "admin" | "viewer" }).role = (
          token as JWT & { role: "owner" | "admin" | "viewer" }
        ).role;
        (session.user as { tenantId: number }).tenantId = (
          token as JWT & { tenantId: number }
        ).tenantId;
      }
      return session;
    },
  },
});

// ── Type extensions (declaration merging) ─────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: number;
      role: "owner" | "admin" | "viewer";
      tenantId: number;
    } & import("next-auth").DefaultSession["user"];
  }

  interface User {
    role: "owner" | "admin" | "viewer";
    tenantId?: number;
  }
}
