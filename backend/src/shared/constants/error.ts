export enum ErrCode {
  InternalError = "internal-error",
  NotFound = "not-found",
  BadRequest = "bad-request",
  ValidationError = "validation-error",
  RateLimitExceeded = "rate-limit-exceeded",
  DuplicateRequest = "duplicate-request",
  Unauthorized = "unauthorized",

  AssetNotFound = "asset-not-found",

  UserNotFound = "user-not-found",

  TransactionNotFound = "transaction-not-found",
}

export class AppErr extends Error {
  public readonly detail?: { errors?: unknown };
  public readonly code: ErrCode;

  constructor(code: ErrCode, detail?: { errors?: unknown }) {
    super(code);
    this.detail = detail;
    this.code = code;
  }
}
