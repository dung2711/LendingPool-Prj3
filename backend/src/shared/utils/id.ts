import { DiscordSnowflake } from "@sapphire/snowflake";
import { v4 as uuidv4 } from "uuid";

export class IdUtils {
  generateId(): string {
    return uuidv4();
  }

  snowflakeId(): bigint {
    return DiscordSnowflake.generate();
  }
}
