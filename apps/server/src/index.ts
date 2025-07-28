import "dotenv/config";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "./lib/context";
import { appRouter } from "./routers/index";
import { auth } from "./lib/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db } from "./db";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3001",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Debug auth object
console.log("Auth object:", auth);
console.log("Auth handler:", auth.handler);

// Test endpoint to verify route registration
app.post("/api/auth/test", (c) => {
  console.log("Test auth route hit");
  return c.json({ message: "Auth test route working" });
});

// Use a more specific route pattern - must come after specific routes
app.all("/api/auth/*", async (c) => {
  console.log("Auth route hit:", c.req.url);
  try {
    const response = await auth.handler(c.req.raw);
    console.log("Auth handler response:", response);
    return response;
  } catch (error) {
    console.error("Auth handler error:", error);
    return c.json({ error: "Auth handler failed" }, 500);
  }
});

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  })
);

app.get("/", (c) => {
  return c.text("OK");
});

// Test database connection
app.get("/test-db", async (c) => {
  try {
    const result = await db.execute("SELECT 1 as test");
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error("Database connection error:", error);
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// Test UUID generation
app.get("/test-uuid", async (c) => {
  try {
    const result = await db.execute("SELECT gen_random_uuid() as uuid");
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error("UUID generation error:", error);
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// Start the server
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

console.log(`🚀 Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
