import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Validate required environment variables
const googleId = process.env.AUTH_GOOGLE_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET;
const authSecret = process.env.AUTH_SECRET;

if (!googleId) {
  throw new Error("Missing AUTH_GOOGLE_ID environment variable.");
}

if (!googleSecret) {
  throw new Error("Missing AUTH_GOOGLE_SECRET environment variable.");
}

if (!authSecret) {
  throw new Error("Missing AUTH_SECRET environment variable.");
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: googleId,
      clientSecret: googleSecret,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: async ({ auth }) => {
      // Return true if user is authenticated, false otherwise
      // NextAuth handles the redirect to signIn page when false is returned
      return !!auth;
    },
  },
});
