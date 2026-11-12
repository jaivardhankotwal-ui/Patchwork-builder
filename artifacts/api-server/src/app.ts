import express, { type Express } from "express";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ServiceError } from "./lib/github";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
// Browser APIs are same-origin; do not permit credentialed cross-origin writes.
app.use(express.json({
  limit: "256kb",
  verify: (req, _res, buf) => { (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf); },
}));
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));

app.use("/api", router);
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ name: err.name }, "Request failed");
  res.status(err instanceof ServiceError ? err.status : 500).json({
    error: err instanceof ServiceError ? err.message : "The request failed. Check service connections and retry.",
  });
});

export default app;
