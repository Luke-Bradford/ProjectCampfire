import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/routers/_app";
import { createTRPCContext } from "@/server/trpc/trpc";
import { type NextRequest } from "next/server";

// NOTE: Next.js App Router route handlers (fetch adapter) do not use the
// Pages Router api.bodyParser config. The request body is streamed directly
// from the fetch Request object without a Next.js-imposed size limit.
// Body size for image uploads (~6.7 MB base64 per image) is constrained by:
//   - Zod .max(7_200_000) on the data field in upload.ts (rejects at parse)
//   - The reverse proxy / hosting platform limit (configure to ≥10 MB for uploads)
// No additional config is needed in this file.

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`tRPC error on ${path ?? "<no-path>"}:`, error);
          }
        : undefined,
  });

export { handler as GET, handler as POST };
