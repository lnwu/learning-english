import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Validate required environment variables
// Skip validation during build time if vars aren't set (they'll be set at runtime)
const googleId = process.env.AUTH_GOOGLE_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET;

if (process.env.NODE_ENV !== "production" && process.env.SKIP_ENV_VALIDATION !== "true") {
  if (!googleId) {
    throw new Error(
      "Missing AUTH_GOOGLE_ID environment variable. Please add it to your .env.local file."
    );
  }

  if (!googleSecret) {
    throw new Error(
      "Missing AUTH_GOOGLE_SECRET environment variable. Please add it to your .env.local file."
    );
  }
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
