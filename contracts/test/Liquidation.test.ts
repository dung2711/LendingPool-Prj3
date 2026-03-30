import hardhat from "hardhat";

const { ethers } = hardhat;

import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import type { Liquidation as LiquidationContract } from "../typechain-types";
import {
  deployProtocolWithMarketsFixture,
  fundAndDeposit,
  setupLiquidatablePosition,
} from "./Fixture.test";

describe("Liquidation", function () {
  describe("constructor", function () {
    const validAddress = "0x0000000000000000000000000000000000000001";

    it("should set the correct params", async function () {
      const { liquidation, priceRouter, lendingPool, protocolController } =
        await loadFixture(deployProtocolWithMarketsFixture);

      expect(await liquidation.priceRouter()).to.equal(priceRouter.target);
      expect(await liquidation.lendingPool()).to.equal(lendingPool.target);
      expect(await liquidation.controller()).to.equal(
        protocolController.target,
      );
      expect(await liquidation.liquidationThreshold()).to.be.gt(0n);
      expect(await liquidation.closeFactor()).to.be.gt(0n);
      expect(await liquidation.liquidationIncentive()).to.be.gt(0n);
    });

    it("should revert if price router address is zero", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          ethers.ZeroAddress,
          validAddress,
          ethers.parseUnits("0.8", 18),
          ethers.parseUnits("0.5", 18),
          ethers.parseUnits("0.1", 18),
          validAddress,
        ),
      ).to.be.revertedWith("Invalid price router");
    });

    it("should revert if lending pool address is zero", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          validAddress,
          ethers.ZeroAddress,
          ethers.parseUnits("0.8", 18),
          ethers.parseUnits("0.5", 18),
          ethers.parseUnits("0.1", 18),
          validAddress,
        ),
      ).to.be.revertedWith("Invalid lending pool");
    });

    it("should revert if controller address is zero", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          validAddress,
          validAddress,
          ethers.parseUnits("0.8", 18),
          ethers.parseUnits("0.5", 18),
          ethers.parseUnits("0.1", 18),
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWith("Invalid controller");
    });

    it("should revert if liquidation threshold is zero", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          validAddress,
          validAddress,
          0n,
          ethers.parseUnits("0.5", 18),
          ethers.parseUnits("0.1", 18),
          validAddress,
        ),
      ).to.be.revertedWith("Invalid threshold");
    });

    it("should revert if liquidation threshold exceeds SCALE", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          validAddress,
          validAddress,
          ethers.parseUnits("1.1", 18),
          ethers.parseUnits("0.5", 18),
          ethers.parseUnits("0.1", 18),
          validAddress,
        ),
      ).to.be.revertedWith("Invalid threshold");
    });

    it("should revert if close factor is zero", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          validAddress,
          validAddress,
          ethers.parseUnits("0.8", 18),
          0n,
          ethers.parseUnits("0.1", 18),
          validAddress,
        ),
      ).to.be.revertedWith("Invalid close factor");
    });

    it("should revert if close factor exceeds SCALE", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          validAddress,
          validAddress,
          ethers.parseUnits("0.8", 18),
          ethers.parseUnits("1.1", 18),
          ethers.parseUnits("0.1", 18),
          validAddress,
        ),
      ).to.be.revertedWith("Invalid close factor");
    });

    it("should revert if liquidation incentive is zero", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          validAddress,
          validAddress,
          ethers.parseUnits("0.8", 18),
          ethers.parseUnits("0.5", 18),
          0n,
          validAddress,
        ),
      ).to.be.revertedWith("Incentive too high");
    });

    it("should revert if liquidation incentive exceeds 0.2e18", async function () {
      const Liquidation = await ethers.getContractFactory("Liquidation");
      await expect(
        Liquidation.deploy(
          validAddress,
          validAddress,
          ethers.parseUnits("0.8", 18),
          ethers.parseUnits("0.5", 18),
          ethers.parseUnits("0.3", 18),
          validAddress,
        ),
      ).to.be.revertedWith("Incentive too high");
    });
  });

  describe("detect undercollateralized positions", function () {
    it("should correctly identify undercollateralized positions", async function () {
      const {
        lendingPool,
        liquidation,
        protocolController,
        timelock,
        signers: { alice, bob, admin },
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await setupLiquidatablePosition(
        usdc,
        weth,
        lendingPool,
        bob,
        alice,
        admin,
        protocolController,
        timelock,
      );
      expect(await liquidation.isAccountLiquidatable(alice.address)).to.be.true;
    });

    it("should return false for account with no deposits", async function () {
      const {
        liquidation,
        signers: { alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      expect(await liquidation.isAccountLiquidatable(alice.address)).to.be
        .false;
    });

    it("should return false for account with deposits but no borrows", async function () {
      const {
        lendingPool,
        liquidation,
        signers: { alice, admin },
        tokens: { usdc },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(
        usdc,
        alice,
        ethers.parseUnits("1000", 6),
        lendingPool,
        admin,
      );
      expect(await liquidation.isAccountLiquidatable(alice.address)).to.be
        .false;
    });

    it("should return false for healthy account", async function () {
      const {
        lendingPool,
        liquidation,
        signers: { alice, bob, admin },
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(
        usdc,
        alice,
        ethers.parseUnits("1000", 6),
        lendingPool,
        admin,
      );
      await fundAndDeposit(
        weth,
        bob,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await lendingPool
        .connect(alice)
        .borrow(usdc.target, ethers.parseUnits("500", 6));
      expect(await liquidation.isAccountLiquidatable(alice.address)).to.be
        .false;
    });

    it("should return true when interest accrual causes account to become undercollateralized", async function () {
      const {
        lendingPool,
        liquidation,
        signers: { alice, bob, admin },
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcLiquidity = ethers.parseUnits("5000", 6);
      await fundAndDeposit(usdc, bob, usdcLiquidity, lendingPool, admin);
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("0.5"),
        lendingPool,
        admin,
      );
      await lendingPool
        .connect(alice)
        .borrow(usdc.target, ethers.parseUnits("790", 6));

      await time.increase(5 * 365 * 24 * 3600);
      expect(await liquidation.isAccountLiquidatable(alice.address)).to.be.true;
    });
  });

  describe("calculate seize amount", function () {
    it("should include liquidation incentive in seize amount", async function () {
      const {
        liquidation,
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      const repayAmount = ethers.parseUnits("100", 6); // 100 USDC
      const seizeAmount = await liquidation.calculateSeizeAmount(
        usdc.target,
        weth.target,
        repayAmount,
      );

      const scale = await liquidation.SCALE();
      const incentive = await liquidation.liquidationIncentive();
      const priceBorrowed = ethers.parseEther("1");
      const priceCollateral = ethers.parseEther("2000");
      const repayAmount18 = repayAmount * 10n ** 12n;

      const expectedWithoutIncentive =
        (repayAmount18 * priceBorrowed) / priceCollateral;
      const expectedWithIncentive =
        (repayAmount18 * (scale + incentive) * priceBorrowed) /
        (priceCollateral * scale);

      expect(seizeAmount).to.equal(expectedWithIncentive);
      expect(seizeAmount).to.be.gt(expectedWithoutIncentive);
    });

    it("should handle 6-decimal repay vs 18-decimal collateral correctly", async function () {
      const {
        liquidation,
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      const repayAmount = ethers.parseUnits("100", 6); // 100 USDC
      const seizeAmount = await liquidation.calculateSeizeAmount(
        usdc.target,
        weth.target,
        repayAmount,
      );

      // 100 USDC * 1.05 / 2000 = 0.0525 WETH
      expect(seizeAmount).to.equal(ethers.parseEther("0.0525"));
    });

    it("should handle 18-decimal repay vs 6-decimal collateral correctly", async function () {
      const {
        liquidation,
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      const repayAmount = ethers.parseEther("0.1"); // 0.1 WETH
      const seizeAmount = await liquidation.calculateSeizeAmount(
        weth.target,
        usdc.target,
        repayAmount,
      );

      // 0.1 WETH * 2000 * 1.05 = 210 USDC
      expect(seizeAmount).to.equal(ethers.parseUnits("210", 6));
    });

    it("should scale proportionally with repay amount", async function () {
      const {
        liquidation,
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      const repayAmount1 = ethers.parseUnits("100", 6);
      const repayAmount2 = ethers.parseUnits("200", 6);

      const seizeAmount1 = await liquidation.calculateSeizeAmount(
        usdc.target,
        weth.target,
        repayAmount1,
      );
      const seizeAmount2 = await liquidation.calculateSeizeAmount(
        usdc.target,
        weth.target,
        repayAmount2,
      );

      expect(seizeAmount2).to.equal(seizeAmount1 * 2n);
    });

    it("should revert when collateral asset has no price feed", async function () {
      const {
        liquidation,
        protocolController,
        signers: { admin },
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      await protocolController.connect(admin).removeFeed(weth.target);

      await expect(
        liquidation.calculateSeizeAmount(
          usdc.target,
          weth.target,
          ethers.parseUnits("100", 6),
        ),
      ).to.be.revertedWith("No price feed available");
    });
  });

  describe("liquidate()", function () {
    type LiquidationExecutedArgs = {
      liquidator: string;
      borrower: string;
      repayAsset: string;
      collateralAsset: string;
      repayAmount: bigint;
      seizeAmount: bigint;
    };

    async function liquidationReadyFixture() {
      const fixture = await deployProtocolWithMarketsFixture();
      const {
        lendingPool,
        liquidation,
        protocolController,
        timelock,
        signers: { alice, bob, admin, liquidator },
        tokens: { usdc, weth },
      } = fixture;

      await setupLiquidatablePosition(
        usdc,
        weth,
        lendingPool,
        bob,
        alice,
        admin,
        protocolController,
        timelock,
      );

      const liquidatorFunds = ethers.parseUnits("10000", 6);
      await usdc.connect(admin).mint(liquidator.address, liquidatorFunds);
      await usdc
        .connect(liquidator)
        .approve(liquidation.target, liquidatorFunds);

      return fixture;
    }

    async function getLiquidationEventArgs(
      liquidation: LiquidationContract,
      blockNumber: number,
    ): Promise<LiquidationExecutedArgs> {
      const events = await liquidation.queryFilter(
        liquidation.filters.LiquidationExecuted(),
        blockNumber,
        blockNumber,
      );
      expect(events.length).to.be.greaterThan(0);
      const args = events[events.length - 1]
        .args as unknown as LiquidationExecutedArgs;
      return args;
    }

    it("should reduce borrower debt and collateral after liquidation", async function () {
      const {
        lendingPool,
        liquidation,
        signers: { alice, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      const borrowBefore = await lendingPool.getUserCurrentBorrow(
        alice.address,
        usdc.target,
      );
      const collateralBefore = await lendingPool.getUserCurrentDeposit(
        alice.address,
        weth.target,
      );

      await liquidation
        .connect(liquidator)
        .liquidate(
          alice.address,
          liquidator.address,
          usdc.target,
          weth.target,
          ethers.parseUnits("500", 6),
        );

      const borrowAfter = await lendingPool.getUserCurrentBorrow(
        alice.address,
        usdc.target,
      );
      const collateralAfter = await lendingPool.getUserCurrentDeposit(
        alice.address,
        weth.target,
      );

      expect(borrowAfter).to.be.lt(borrowBefore);
      expect(collateralAfter).to.be.lt(collateralBefore);
    });

    it("should send seized collateral to liquidator", async function () {
      const {
        liquidation,
        signers: { alice, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      const liquidatorCollateralBefore = await weth.balanceOf(
        liquidator.address,
      );
      const tx = await liquidation
        .connect(liquidator)
        .liquidate(
          alice.address,
          liquidator.address,
          usdc.target,
          weth.target,
          ethers.parseUnits("500", 6),
        );
      const receipt = await tx.wait();
      const eventArgs = await getLiquidationEventArgs(
        liquidation,
        receipt!.blockNumber,
      );

      const liquidatorCollateralAfter = await weth.balanceOf(
        liquidator.address,
      );
      expect(liquidatorCollateralAfter - liquidatorCollateralBefore).to.equal(
        eventArgs.seizeAmount,
      );
    });

    it("should cap repay at closeFactor * currentBorrow", async function () {
      const {
        lendingPool,
        liquidation,
        signers: { alice, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      const requestedRepay = ethers.parseUnits("1000", 6);
      const borrowBefore = await lendingPool.getUserCurrentBorrow(
        alice.address,
        usdc.target,
      );
      const scale = await liquidation.SCALE();
      const closeFactor = await liquidation.closeFactor();
      const expectedMaxRepay = (borrowBefore * closeFactor) / scale;

      const tx = await liquidation
        .connect(liquidator)
        .liquidate(
          alice.address,
          liquidator.address,
          usdc.target,
          weth.target,
          requestedRepay,
        );
      const receipt = await tx.wait();
      const eventArgs = await getLiquidationEventArgs(
        liquidation,
        receipt!.blockNumber,
      );

      expect(eventArgs.repayAmount).to.be.lt(requestedRepay);
      expect(eventArgs.repayAmount).to.be.lte(expectedMaxRepay + 1_000n);
    });

    it("should not cap repay when repay amount is within close factor limit", async function () {
      const {
        liquidation,
        signers: { alice, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      const requestedRepay = ethers.parseUnits("100", 6);
      const tx = await liquidation
        .connect(liquidator)
        .liquidate(
          alice.address,
          liquidator.address,
          usdc.target,
          weth.target,
          requestedRepay,
        );
      const receipt = await tx.wait();
      const eventArgs = await getLiquidationEventArgs(
        liquidation,
        receipt!.blockNumber,
      );

      expect(eventArgs.repayAmount).to.equal(requestedRepay);
    });

    it("should cap seize at borrower deposit balance", async function () {
      const {
        lendingPool,
        liquidation,
        protocolController,
        signers: { admin, alice, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      await protocolController
        .connect(admin)
        .setPrice(weth.target, ethers.parseEther("500"));

      const borrowerCollateralBefore = await lendingPool.getUserCurrentDeposit(
        alice.address,
        weth.target,
      );

      const tx = await liquidation
        .connect(liquidator)
        .liquidate(
          alice.address,
          liquidator.address,
          usdc.target,
          weth.target,
          ethers.parseUnits("1000", 6),
        );
      const receipt = await tx.wait();
      const eventArgs = await getLiquidationEventArgs(
        liquidation,
        receipt!.blockNumber,
      );

      const borrowerCollateralAfter = await lendingPool.getUserCurrentDeposit(
        alice.address,
        weth.target,
      );
      expect(eventArgs.seizeAmount).to.equal(borrowerCollateralBefore);
      expect(borrowerCollateralAfter).to.equal(0n);
    });

    it("should revert if borrower address is zero", async function () {
      const {
        liquidation,
        signers: { liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      await expect(
        liquidation
          .connect(liquidator)
          .liquidate(
            ethers.ZeroAddress,
            liquidator.address,
            usdc.target,
            weth.target,
            ethers.parseUnits("100", 6),
          ),
      ).to.be.revertedWith("Zero address");
    });

    it("should revert if liquidator address param is zero", async function () {
      const {
        liquidation,
        signers: { alice, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      await expect(
        liquidation
          .connect(liquidator)
          .liquidate(
            alice.address,
            ethers.ZeroAddress,
            usdc.target,
            weth.target,
            ethers.parseUnits("100", 6),
          ),
      ).to.be.revertedWith("Zero address");
    });

    it("should revert if account is not liquidatable", async function () {
      const {
        lendingPool,
        liquidation,
        signers: { admin, alice, bob, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      await fundAndDeposit(
        usdc,
        bob,
        ethers.parseUnits("5000", 6),
        lendingPool,
        admin,
      );
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await lendingPool
        .connect(alice)
        .borrow(usdc.target, ethers.parseUnits("500", 6));

      const liquidatorFunds = ethers.parseUnits("1000", 6);
      await usdc.connect(admin).mint(liquidator.address, liquidatorFunds);
      await usdc
        .connect(liquidator)
        .approve(liquidation.target, liquidatorFunds);

      await expect(
        liquidation
          .connect(liquidator)
          .liquidate(
            alice.address,
            liquidator.address,
            usdc.target,
            weth.target,
            ethers.parseUnits("200", 6),
          ),
      ).to.be.revertedWith("Account is not liquidatable");
    });

    it("should emit LiquidationExecuted event", async function () {
      const {
        liquidation,
        signers: { alice, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      await expect(
        liquidation
          .connect(liquidator)
          .liquidate(
            alice.address,
            liquidator.address,
            usdc.target,
            weth.target,
            ethers.parseUnits("500", 6),
          ),
      )
        .to.emit(liquidation, "LiquidationExecuted")
        .withArgs(
          liquidator.address,
          alice.address,
          usdc.target,
          weth.target,
          ethers.parseUnits("500", 6),
          ethers.parseEther("0.35"),
        );
    });

    it("should revert seizeCollateral if called directly (not via liquidation contract)", async function () {
      const {
        lendingPool,
        signers: { admin, alice, bob },
        tokens: { weth },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      await expect(
        lendingPool
          .connect(admin)
          .seizeCollateral(alice.address, weth.target, 1n, bob.address),
      ).to.be.revertedWith("Not liquidation contract");
    });

    it("should revert when repay amount is zero", async function () {
      const {
        liquidation,
        signers: { alice, liquidator },
        tokens: { usdc, weth },
      } = await loadFixture(liquidationReadyFixture);

      await expect(
        liquidation
          .connect(liquidator)
          .liquidate(
            alice.address,
            liquidator.address,
            usdc.target,
            weth.target,
            0n,
          ),
      ).to.be.revertedWith("Repay amount must be greater than zero");
    });
  });
});
