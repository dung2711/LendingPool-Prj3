import { expect } from "chai";
import hardhat from "hardhat";
import type { InterestRateModel } from "../typechain-types";

const { ethers } = hardhat;

/**
 * InterestRateModel — pure math, không cần fixture nặng
 *
 * Params dùng trong test (stable IRM):
 *   baseRate       = 2%
 *   rateSlope1     = 8%
 *   rateSlope2     = 100%
 *   optimalUtil    = 80%
 *   reserveFactor  = 10%
 *
 * Borrow rate expected:
 *   util=0%   → 0
 *   util=40%  → 2% + (40% * 8%)  = 5.2%
 *   util=80%  → 2% + (40% * 80*) = 8.4%
 *   util=90%  → 2% + 0.80×8% + 1.00×(0.90−0.80) = 18.4%
 *   util=100% → 2% + 0.80×8% + 1.00×(1.00−0.80) = 28.4%
 */

describe("InterestRateModel", function () {
  let interestRateModel: InterestRateModel;

  beforeEach(async function () {
    const IRM = await ethers.getContractFactory("InterestRateModel");
    interestRateModel = await IRM.deploy(
      ethers.parseEther("0.02"), // baseRate
      ethers.parseEther("0.08"), // rateSlope1
      ethers.parseEther("1"), // rateSlope2
      ethers.parseEther("0.8"), // optimalUtilization
      ethers.parseEther("0.1"), // reserveFactor
    );
    await interestRateModel.waitForDeployment();
  });

  describe("constructor", function () {
    it("should set parameters correctly", async function () {
      expect(await interestRateModel.baseRate()).to.equal(
        ethers.parseEther("0.02"),
      );
      expect(await interestRateModel.rateSlope1()).to.equal(
        ethers.parseEther("0.08"),
      );
      expect(await interestRateModel.rateSlope2()).to.equal(
        ethers.parseEther("1"),
      );
      expect(await interestRateModel.optimalUtilization()).to.equal(
        ethers.parseEther("0.8"),
      );
      expect(await interestRateModel.reserveFactor()).to.equal(
        ethers.parseEther("0.1"),
      );
    });

    it("should revert if optimal utilization is greater than 100%", async function () {
      const IRM = await ethers.getContractFactory("InterestRateModel");
      await expect(
        IRM.deploy(
          ethers.parseEther("0.02"), // baseRate
          ethers.parseEther("0.08"), // rateSlope1
          ethers.parseEther("1"), // rateSlope2
          ethers.parseEther("1") + 1n, // optimalUtilization
          ethers.parseEther("0.1"), // reserveFactor
        ),
      ).to.be.revertedWith("Invalid optimal utilization");
    });

    it("should revert if reserve factor is greater than 100%", async function () {
      const IRM = await ethers.getContractFactory("InterestRateModel");
      await expect(
        IRM.deploy(
          ethers.parseEther("0.02"), // baseRate
          ethers.parseEther("0.08"), // rateSlope1
          ethers.parseEther("1"), // rateSlope2
          ethers.parseEther("0.8"), // optimalUtilization
          ethers.parseEther("1") + 1n, // reserveFactor
        ),
      ).to.be.revertedWith("Invalid reserve factor");
    });
  });

  describe("getBorrowRate", function () {
    it("should return correct borrow rate at different utilization levels", async function () {
      // util=0%
      expect(
        await interestRateModel.getBorrowRate(ethers.parseEther("0")),
      ).to.equal(ethers.parseEther("0"));

      // util=40%
      expect(
        await interestRateModel.getBorrowRate(ethers.parseEther("0.4")),
      ).to.equal(ethers.parseEther("0.052"));

      // util=80%
      expect(
        await interestRateModel.getBorrowRate(ethers.parseEther("0.8")),
      ).to.equal(ethers.parseEther("0.084"));

      // util=90%
      expect(
        await interestRateModel.getBorrowRate(ethers.parseEther("0.9")),
      ).to.equal(ethers.parseEther("0.184"));

      // util=100%
      expect(
        await interestRateModel.getBorrowRate(ethers.parseEther("1")),
      ).to.equal(ethers.parseEther("0.284"));
    });

    it("should increase borrow rate as utilization increases", async function () {
      const utilLevels = ["0.1", "0.2", "0.4", "0.6", "0.8", "0.9", "1"];
      let prev = 0n;
      for (const util of utilLevels) {
        const rate = await interestRateModel.getBorrowRate(
          ethers.parseEther(util),
        );
        expect(rate).to.be.gt(prev);
        prev = rate;
      }
    });
  });

  describe("getDepositRate", function () {
    it("should return correct deposit rate based on borrow rate and reserve factor", async function () {
      // util=0%
      expect(
        await interestRateModel.getDepositRate(ethers.parseEther("0")),
      ).to.equal(ethers.parseEther("0"));

      // util=40%
      const borrowRate40 = await interestRateModel.getBorrowRate(
        ethers.parseEther("0.4"),
      );
      const expectedDeposit40 =
        (borrowRate40 *
          ethers.parseUnits("0.4") *
          (ethers.parseEther("1") - ethers.parseEther("0.1"))) /
        (ethers.parseEther("1") * ethers.parseUnits("1"));
      expect(
        await interestRateModel.getDepositRate(ethers.parseEther("0.4")),
      ).to.equal(expectedDeposit40);
    });

    it("should increase deposit rate as utilization increases", async function () {
      const utilLevels = ["0.1", "0.2", "0.4", "0.6", "0.8", "0.9", "1"];
      let prev = 0n;
      for (const util of utilLevels) {
        const rate = await interestRateModel.getDepositRate(
          ethers.parseEther(util),
        );
        expect(rate).to.be.gt(prev);
        prev = rate;
      }
    });

    it("should be lower than borrow rate due to reserve factor", async function () {
      const utilLevels = ["0.1", "0.2", "0.4", "0.6", "0.8", "0.9", "1"];
      for (const util of utilLevels) {
        const borrowRate = await interestRateModel.getBorrowRate(
          ethers.parseEther(util),
        );
        const depositRate = await interestRateModel.getDepositRate(
          ethers.parseEther(util),
        );
        expect(depositRate).to.be.lt(borrowRate);
      }
    });
  });
});
