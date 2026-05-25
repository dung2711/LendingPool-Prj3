import { ethers } from "ethers";
import axiosClient from "@/lib/axios";

const AUTH_ERROR_CODES = new Set([
  "unauthorized",
  "session-not-found",
  "session-revoked",
  "session-expired",
]);

type ApiErrorPayload = {
  success?: boolean;
  code?: string;
  message?: string;
  errors?: string | { errors?: string };
};

let authenticatedKey: string | null = null;
let inFlightAuthKey: string | null = null;
let inFlightAuthPromise: Promise<void> | null = null;

function normalizeChainId(chainId: string): string {
  const trimmed = chainId.trim();
  if (!trimmed) return trimmed;

  const normalized = Number(trimmed);
  if (Number.isInteger(normalized) && normalized > 0) {
    return String(normalized);
  }

  return trimmed;
}

function getAuthKey(address: string, chainId: string): string {
  return `${ethers.getAddress(address)}:${normalizeChainId(chainId)}`;
}

export function getApiErrorMessage(
  payload: unknown,
  fallback: string,
): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as ApiErrorPayload;
  if (body.success !== false) {
    return null;
  }

  if (typeof body.errors === "string" && body.errors.trim()) {
    return body.errors;
  }

  if (
    body.errors &&
    typeof body.errors === "object" &&
    typeof body.errors.errors === "string" &&
    body.errors.errors.trim()
  ) {
    return body.errors.errors;
  }

  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }

  if (typeof body.code === "string" && body.code.trim()) {
    return body.code;
  }

  return fallback;
}

function isAuthFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const body = payload as ApiErrorPayload;
  return body.success === false && AUTH_ERROR_CODES.has(body.code ?? "");
}

function assertApiSuccess(payload: unknown, fallback: string): void {
  const errorMessage = getApiErrorMessage(payload, fallback);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
}

async function authenticateWithWallet(
  address: string,
  chainId: string,
): Promise<void> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Wallet provider is not available");
  }

  const checksumAddress = ethers.getAddress(address);
  const normalizedChainId = normalizeChainId(chainId);
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const signerAddress = ethers.getAddress(await signer.getAddress());

  if (signerAddress !== checksumAddress) {
    throw new Error("Connected wallet does not match the requested account");
  }

  const nonceResponse = await axiosClient.post("/api/auth/nonce", {
    userAddress: checksumAddress,
    chainId: normalizedChainId,
  });
  assertApiSuccess(nonceResponse.data, "Failed to request auth nonce");

  const message = nonceResponse.data?.message;
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Auth nonce response did not include a signable message");
  }

  const signature = await signer.signMessage(message);

  const verifyResponse = await axiosClient.post("/api/auth/verify", {
    userAddress: checksumAddress,
    chainId: normalizedChainId,
    signature,
  });
  assertApiSuccess(verifyResponse.data, "Failed to verify wallet signature");
}

function ensureAuthenticated(
  address: string,
  chainId: string,
  options?: { force?: boolean },
): Promise<void> | void {
  const force = options?.force ?? false;
  const key = getAuthKey(address, chainId);

  if (!force && authenticatedKey === key) {
    return;
  }

  if (inFlightAuthPromise && inFlightAuthKey === key) {
    return inFlightAuthPromise;
  }

  const authPromise = authenticateWithWallet(address, chainId)
    .then(() => {
      authenticatedKey = key;
    })
    .finally(() => {
      if (inFlightAuthPromise === authPromise) {
        inFlightAuthPromise = null;
        inFlightAuthKey = null;
      }
    });

  inFlightAuthKey = key;
  inFlightAuthPromise = authPromise;

  return authPromise;
}

async function requestWithAuthRetry<T>(params: {
  address: string;
  chainId: string;
  request: () => Promise<{ data: T | ApiErrorPayload }>;
  fallbackErrorMessage: string;
}): Promise<T> {
  const { address, chainId, request, fallbackErrorMessage } = params;

  const firstResponse = await request();
  if (!isAuthFailure(firstResponse.data)) {
    assertApiSuccess(firstResponse.data, fallbackErrorMessage);
    return firstResponse.data as T;
  }

  await ensureAuthenticated(address, chainId, { force: true });

  const retryResponse = await request();
  assertApiSuccess(retryResponse.data, fallbackErrorMessage);
  return retryResponse.data as T;
}

async function checkSession(expectedAddress?: string): Promise<boolean> {
  try {
    const response = await axiosClient.get("/api/users/detail");
    if (response.data?.success !== true) return false;
    const sessionAddress = response.data?.user?.userAddress;
    if (typeof sessionAddress !== "string" || !sessionAddress.trim())
      return false;
    if (!expectedAddress) return true;
    try {
      return (
        ethers.getAddress(sessionAddress) === ethers.getAddress(expectedAddress)
      );
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function refreshSession(): Promise<boolean> {
  try {
    const response = await axiosClient.post("/api/auth/refresh");
    return response.data?.success === true;
  } catch {
    return false;
  }
}

async function ensureSession(expectedAddress?: string): Promise<boolean> {
  const active = await checkSession(expectedAddress);
  if (active) return true;

  const refreshed = await refreshSession();
  if (!refreshed) return false;

  return checkSession(expectedAddress);
}

function clearAuthCache(): void {
  authenticatedKey = null;
  inFlightAuthKey = null;
  inFlightAuthPromise = null;
}

export const authService = {
  normalizeChainId,
  ensureAuthenticated,
  requestWithAuthRetry,
  checkSession,
  refreshSession,
  ensureSession,
  clearAuthCache,
  getApiErrorMessage,
};
