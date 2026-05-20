import type { ErrCode } from "src/shared/constants";
import { AppErr } from "src/shared/constants";
import { expect } from "vitest";

/**
 * Asserts that a promise rejects with an AppErr having the expected error code.
 * Optionally checks the error message contains a substring.
 */
export async function expectAppErr(
  promise: Promise<unknown>,
  code: ErrCode,
  messageContains?: string,
): Promise<AppErr> {
  try {
    await promise;
    throw new Error(`Expected AppErr(${code}) but promise resolved`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppErr);
    expect((error as AppErr).code).toBe(code);
    if (messageContains) {
      const detail = (error as AppErr).detail;
      expect(JSON.stringify(detail)).toContain(messageContains);
    }
    return error as AppErr;
  }
}
