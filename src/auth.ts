import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/security";
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db), session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 }, pages: { signIn: "/login" },
  providers: [
    Credentials({ credentials: { email: {}, password: {}, remember: {} }, async authorize(credentials) {
      if (typeof credentials.email !== "string" || credentials.email.length > 254 || typeof credentials.password !== "string" || credentials.password.length > 128) return null;
      const email = credentials.email.trim().toLowerCase();
      await rateLimit(`login:${email}`, 15);
      const user = await db.user.findUnique({ where: { email } });
      const valid = await verifyPassword(credentials.password, user?.passwordHash ?? "00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000");
      if (!user || !user.passwordHash || !valid) return null;
      return { id: user.id, name: user.name, email: user.email, image: user.image, remember: credentials.remember === "true" };
    } }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })] : []),
  ],
  callbacks: {
    async signIn({ account, profile }) { return account?.provider !== "google" || profile?.email_verified === true; },
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        token.validUntil = Date.now() + ((user as { remember?: boolean }).remember === false ? 12 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);
        token.version = (await db.user.findUnique({ where: { id: user.id }, select: { sessionVersion: true } }))?.sessionVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.sessionVersion = token.version as number;
      session.user.validUntil = token.validUntil as number;
      return session;
    },
  },
});
