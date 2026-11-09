import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ServiceError } from "./lib/github";

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
app.use(cors());
app.use(express.json({
  limit: "256kb",
  verify: (req, _res, buf) => { (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf); },
}));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ name: err.name }, "Request failed");
  res.status(err instanceof ServiceError ? err.status : 500).json({
    error: err instanceof ServiceError ? err.message : "The request failed. Check service connections and retry.",
  });
});

export default app;
