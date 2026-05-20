import { ErrCode } from "src/shared/constants";
import { validateAddress } from "src/shared/utils/validate";
import { describe, expect, it } from "vitest";
import { expectAppErr } from "../test-helpers/error";

describe("validateAddress", () => {
  it("should return checksummed address for valid input", () => {
    const result = validateAddress(
      "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    );

    expect(result).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  });

  it("should throw BadRequest for invalid address", async () => {
    await expectAppErr(
      Promise.resolve().then(() => validateAddress("0xinvalid")),
      ErrCode.BadRequest,
    );
  });

  it("should throw BadRequest for zero address", async () => {
    await expectAppErr(
      Promise.resolve().then(() =>
        validateAddress("0x0000000000000000000000000000000000000000"),
      ),
      ErrCode.BadRequest,
    );
  });
});
