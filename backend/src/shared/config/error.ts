import type { Logger } from "@logtape/logtape";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppErr, ErrCode } from "../constants/error";

function getHttpStatus(code: ErrCode): number {
  switch (code) {
    case ErrCode.ValidationError:
    case ErrCode.BadRequest:
    case ErrCode.InvalidOTP:
    case ErrCode.InvalidOtpToken:
      return 400;
    case ErrCode.Unauthorized:
    case ErrCode.SessionNotFound:
    case ErrCode.SessionRevoked:
    case ErrCode.SessionExpired:
      return 401;
    case ErrCode.NotFound:
    case ErrCode.AssetNotFound:
    case ErrCode.UserNotFound:
    case ErrCode.TransactionNotFound:
      return 404;
    case ErrCode.DuplicateRequest:
    case ErrCode.EmailAlreadyRegistered:
      return 409;
    case ErrCode.RateLimitExceeded:
      return 429;
    case ErrCode.ExternalAPIError:
      return 502;
    case ErrCode.InternalError:
    default:
      return 500;
  }
}

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

export function createErrorHandler(
  logger: Logger,
  options?: { exposeInternalErrors?: boolean },
) {
  const exposeInternalErrors =
    options?.exposeInternalErrors ?? process.env.NODE_ENV !== "production";

  // Express requires exactly 4 params to detect error middleware
  return (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    const requestInfo = getRequestInfo(req);

    if (err instanceof AppErr) {
      logger.error("HTTP error: {method} {path} -> {code} -> {detail}", {
        method: requestInfo.method,
        path: requestInfo.path,
        code: err.code,
        detail: err.detail?.errors ?? "",
      });
      res
        .status(getHttpStatus(err.code))
        .json(makeErrBody(err.code, err.detail?.errors));
      return;
    }

    if (err instanceof ZodError) {
      logger.error(
        "Validation error: {method} {path} -> {errorCount} error(s)",
        {
          method: requestInfo.method,
          path: requestInfo.path,
          errorCount: err.issues.length,
          errors: err.issues,
        },
      );
      res
        .status(getHttpStatus(ErrCode.ValidationError))
        .json(makeErrBody(ErrCode.ValidationError, err.issues));
      return;
    }

    const errorName = err instanceof Error ? err.name : "Unknown";
    const errorMessage = err instanceof Error ? err.message : String(err);
    const clientError = exposeInternalErrors
      ? { errorName, errorMessage }
      : {
          errorName: "InternalError",
          errorMessage: "An internal server error occurred",
        };

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
      .status(getHttpStatus(ErrCode.InternalError))
      .json(makeErrBody(ErrCode.InternalError, clientError));
  };
}

export function createNotFoundHandler(logger: Logger) {
  return (req: Request, res: Response): void => {
    logger.warn("Route not found: {method} {path}", {
      method: req.method,
      path: req.path,
    });
    res
      .status(getHttpStatus(ErrCode.NotFound))
      .json(makeErrBody(ErrCode.NotFound, { path: req.url }));
  };
}
