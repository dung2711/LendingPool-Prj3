import type { Logger } from "@logtape/logtape";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppErr, ErrCode } from "../constants/error";

const makeErrBody = (code: ErrCode, errors?: unknown) => ({
  success: false as const,
  code,
  t: new Date().toISOString(),
  errors,
});

const getRequestInfo = (req: Request) => ({
  method: req.method,
  path: req.path,
});

export function createErrorHandler(logger: Logger) {
  // Express requires exactly 4 params to detect error middleware
  return (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    const requestInfo = getRequestInfo(req);

    // Nhánh 1: AppErr — business error có code cụ thể
    if (err instanceof AppErr) {
      logger.error("HTTP error: {method} {path} -> {code} -> {detail}", {
        method: requestInfo.method,
        path: requestInfo.path,
        code: err.code,
        detail: err.detail?.errors ?? "",
      });
      res.status(200).json(makeErrBody(err.code, err.detail?.errors));
      return;
    }

    // Nhánh 2: ZodError — validation error
    if (err instanceof ZodError) {
      logger.error(
        "Validation error: {method} {path} -> {errorCount} error(s)",
        {
          method: requestInfo.method,
          path: requestInfo.path,
          errorCount: err.issues.length,
        },
      );
      res.status(200).json(makeErrBody(ErrCode.ValidationError, err.issues));
      return;
    }

    // Nhánh 3: default — lỗi không mong đợi
    const errorName = err instanceof Error ? err.name : "Unknown";
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error(
      "Unhandled error: {method} {path} -> {errorName}: {errorMessage}",
      {
        method: requestInfo.method,
        path: requestInfo.path,
        errorName,
        errorMessage,
      },
    );

    res
      .status(200)
      .json(makeErrBody(ErrCode.InternalError, { errorName, errorMessage }));
  };
}

// Đặt SAU tất cả routes, TRƯỚC createErrorHandler
export function createNotFoundHandler(logger: Logger) {
  return (req: Request, res: Response): void => {
    logger.warn("Route not found: {method} {path}", {
      method: req.method,
      path: req.path,
    });
    res.status(200).json(makeErrBody(ErrCode.NotFound, { path: req.url }));
  };
}
