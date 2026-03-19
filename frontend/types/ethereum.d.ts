import type { Provider } from "ethers";

declare global {
  interface Window {
    ethereum?: Provider & {
      request: (args: {
        method: string;
        params?: unknown[];
      }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (
        event: string,
        callback: (...args: unknown[]) => void,
      ) => void;
    };
  }
}
