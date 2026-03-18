export enum WSEvent {
  LiquidatableUsersUpdated = "ws:liquidatable:users:updated",
}

export interface WsEventPayload {
  type: WSEvent;
  data: unknown;
  timestamp: number;
}

export interface LiquidatableUsersData {
  users: Array<{
    address: string;
  }>;
  blockNumber: number;
  timestamp: Date;
}
