import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AuthOptions } from "next-auth";
import { db } from "@/lib/db";
import GoogleProvider from "next-auth/providers/google";
import { Adapter } from "next-auth/adapters";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prismaAdapter } from "@/lib/auth/prisma-adapter";

export const auth = async () => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/sign-in");
  }

  return {
    userId: session.user.id,
    user: session.user,
  };
};

export const authOptions: AuthOptions = {
  adapter: prismaAdapter(db) as Adapter,
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        phoneNumber: { label: "Phone Number", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.phoneNumber || !credentials?.password) {
          throw new Error("Missing credentials");
        }

        const user = await db.user.findUnique({
          where: {
            phoneNumber: credentials.phoneNumber,
          },
        });

        if (!user || !user.hashedPassword) {
          throw new Error("Invalid credentials");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        );

        if (!isPasswordValid) {
          throw new Error("Invalid credentials");
        }

        return {
          id: user.id,
          name: user.fullName,
          phoneNumber: user.phoneNumber,
          role: user.role,
          studentId: user.studentId,
        } as any;
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Remove maxAge to make sessions persist indefinitely
    updateAge: 0, // Disable session updates
  },
  jwt: {
    // Remove maxAge to make JWT tokens persist indefinitely
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  callbacks: {
    async session({ token, session }) {
      if (token) {
        session.user.id = token.id;
        session.user.name = token.name;
        session.user.phoneNumber = token.phoneNumber;
        session.user.image = token.picture ?? undefined;
        session.user.role = token.role;
        session.user.studentId = (token as any).studentId;
        
        // Fallback: if studentId is still missing, fetch it from database
        if (!session.user.studentId && token.id) {
          const dbUser = await db.user.findUnique({
            where: { id: token.id as string },
            select: { studentId: true },
          });
          if (dbUser?.studentId) {
            session.user.studentId = dbUser.studentId;
            // Also update the token for future requests
            (token as any).studentId = dbUser.studentId;
          }
        }
      }

      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        // When user first signs in, set the token with user data
        // If studentId is not in user object, fetch it from database
        let studentId = (user as any).studentId;
        if (!studentId && user.id) {
          const dbUser = await db.user.findUnique({
            where: { id: user.id },
            select: { studentId: true },
          });
          studentId = dbUser?.studentId;
        }
        
        return {
          ...token,
          id: user.id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          picture: (user as any).picture,
          role: user.role,
          studentId: studentId,
        };
      }

      // On subsequent requests, if studentId is missing, fetch it from database
      if (token.id && !(token as any).studentId) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: { studentId: true },
        });
        if (dbUser?.studentId) {
          (token as any).studentId = dbUser.studentId;
        }
      }

      return token;
    },
  },
  debug: process.env.NODE_ENV === "development",
}; 