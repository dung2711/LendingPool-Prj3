import { v4 as uuidv4 } from "uuid";

export class IdUtils {
  generateId(): string {
    return uuidv4();
  }
}
