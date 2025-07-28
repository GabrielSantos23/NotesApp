import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema/auth";

// Custom adapter that handles UUID generation
const customAdapter = drizzleAdapter(db, {
  provider: "pg",
  schema: schema,
});

export const auth = betterAuth({
  database: customAdapter,
  trustedOrigins: [process.env.CORS_ORIGIN || "http://localhost:3001"],
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Custom ID generator that creates text IDs
  generateId: () => crypto.randomUUID(),
});
