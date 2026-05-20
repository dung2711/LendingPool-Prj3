import { expect } from "chai";
import hardhat from "hardhat";
import { deployProtocolWithMarketsFixture, donateToPool } from "./Fixture.test";

const { ethers, upgrades } = hardhat;

import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { protocolConfig } from "../scripts/deploy-protocol/config";
import type { LendingPool__factory } from "../typechain-types";
import { fundAndDeposit } from "./Fixture.test";

describe("LendingPool", function () {
  describe("initialize", function () {
    it("should initialize with correct parameters", async function () {
      const { lendingPool, addresses } = await loadFixture(
        deployProtocolWithMarketsFixture,
      );
      const networkAddresses = addresses["sepolia"];
      const config = protocolConfig["sepolia"];
      expect(await lendingPool.controller()).to.equal(
        networkAddresses.controller,
      );
      expect(await lendingPool.liquidation()).to.equal(
        networkAddresses.liquidation,
      );
      expect(await lendingPool.priceRouter()).to.equal(
        networkAddresses.priceRouter,
      );
      expect(await lendingPool.collateralFactor()).to.equal(
        ethers.parseEther(config.collateralFactor.toString()),
      );
    });

    it("should revert if initialize is called more than once", async function () {
      const { lendingPool } = await loadFixture(
        deployProtocolWithMarketsFixture,
      );
      await expect(
        lendingPool.initialize(
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
          ethers.parseEther("0.75"),
          ethers.Wallet.createRandom().address,
        ),
      ).to.be.revertedWithCustomError(lendingPool, "InvalidInitialization");
    });

    it("should revert if initialize is called by implementation contract", async function () {
      const { lendingPool } = await loadFixture(
        deployProtocolWithMarketsFixture,
      );
      const implAddress = await upgrades.erc1967.getImplementationAddress(
        await lendingPool.getAddress(),
      );
      const lendingPoolImpl = await ethers.getContractAt(
        "LendingPool",
        implAddress,
      );
      await expect(
        lendingPoolImpl.initialize(
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
          ethers.parseEther("0.75"),
          ethers.Wallet.createRandom().address,
        ),
      ).to.be.revertedWithCustomError(lendingPoolImpl, "InvalidInitialization");
    });
  });

  describe("deposit", function () {
    it("can deposit normally and update relevant states", async function () {
      const {
        lendingPool,
        tokens: { usdc },
        signers: { admin, alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();
      const usdcMarket = await lendingPool.markets(usdcAddress);
      expect(usdcMarket.totalDeposits).to.equal(0n);
      expect(usdcMarket.depositIndex).to.equal(ethers.parseEther("1"));
      const aliceBalance = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(aliceBalance.deposited).to.equal(0n);
      expect(aliceBalance.depositIndexSnapShot).to.equal(0n);
      const depositAmount = ethers.parseUnits("1000", await usdc.decimals());
      await fundAndDeposit(usdc, alice, depositAmount, lendingPool, admin);
      const aliceBalanceAfter = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(aliceBalanceAfter.deposited).to.equal(depositAmount);
      expect(aliceBalanceAfter.depositIndexSnapShot).to.equal(
        ethers.parseEther("1"),
      );
      const usdcMarketAfter = await lendingPool.markets(usdcAddress);
      expect(usdcMarketAfter.totalDeposits).to.equal(depositAmount);
      expect(await lendingPool.userMarkets(alice.address, 0n)).to.equal(
        usdcAddress,
      );
      expect(
        await lendingPool.userMarketExists(alice.address, usdcAddress),
      ).to.equal(true);
    });

    it("should accumulate deposits from multiple deposits", async function () {
      const {
        lendingPool,
        tokens: { usdc },
        signers: { admin, alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();
      const firstDeposit = ethers.parseUnits("1000", await usdc.decimals());
      const secondDeposit = ethers.parseUnits("500", await usdc.decimals());
      await fundAndDeposit(usdc, alice, firstDeposit, lendingPool, admin);
      await fundAndDeposit(usdc, alice, secondDeposit, lendingPool, admin);
      const aliceBalanceAfter = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(aliceBalanceAfter.deposited).to.gte(firstDeposit + secondDeposit);
    });

    it("should emit Deposit event with correct parameters", async function () {
      const {
        lendingPool,
        tokens: { usdc },
        signers: { admin, alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();
      await usdc
        .connect(admin)
        .mint(alice, ethers.parseUnits("1000", await usdc.decimals()));
      await usdc
        .connect(alice)
        .approve(
          lendingPool.target,
          ethers.parseUnits("1000", await usdc.decimals()),
        );
      await expect(
        lendingPool
          .connect(alice)
          .deposit(
            usdcAddress,
            ethers.parseUnits("1000", await usdc.decimals()),
          ),
      )
        .to.emit(lendingPool, "Deposit")
        .withArgs(
          alice.address,
          usdcAddress,
          ethers.parseUnits("1000", await usdc.decimals()),
        );
    });

    it("should revert properly", async function () {
      const {
        lendingPool,
        protocolController,
        tokens: { usdc },
        signers: { admin, alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const fakeToken = ethers.Wallet.createRandom().address;
      await expect(
        lendingPool.connect(alice).deposit(fakeToken, 1n),
      ).to.be.revertedWith("Market not supported");
      await fundAndDeposit(
        usdc,
        alice,
        ethers.parseUnits("1000", await usdc.decimals()),
        lendingPool,
        admin,
      );
      await expect(
        lendingPool.connect(alice).deposit(await usdc.getAddress(), 0n),
      ).to.be.revertedWith("Amount must be greater than zero");
      await protocolController.connect(admin).pauseLendingPool();
      await expect(
        lendingPool
          .connect(alice)
          .deposit(
            await usdc.getAddress(),
            ethers.parseUnits("1000", await usdc.decimals()),
          ),
      ).to.be.revertedWithCustomError(lendingPool, "EnforcedPause");
    });

    it("should handle token with different decimals correctly", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const wethAddress = await weth.getAddress();
      const depositAmount = ethers.parseUnits("1000", await weth.decimals());
      await fundAndDeposit(weth, alice, depositAmount, lendingPool, admin);
      const aliceBalanceAfter = await lendingPool.getUserCurrentDeposit(
        alice.address,
        wethAddress,
      );
      expect(aliceBalanceAfter).to.equal(depositAmount);

      const usdcAddress = await usdc.getAddress();
      const usdcDepositAmount = ethers.parseUnits(
        "1000",
        await usdc.decimals(),
      );
      await fundAndDeposit(usdc, bob, usdcDepositAmount, lendingPool, admin);
      const bobBalanceAfter = await lendingPool.getUserCurrentDeposit(
        bob.address,
        usdcAddress,
      );
      expect(bobBalanceAfter).to.equal(usdcDepositAmount);
    });
  });

  describe("withdraw", function () {
    it("can withdraw normally and update relevant states and emit Withdraw event", async function () {
      const {
        lendingPool,
        tokens: { usdc },
        signers: { admin, alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();
      const depositAmount = ethers.parseUnits("1000", await usdc.decimals());
      await fundAndDeposit(usdc, alice, depositAmount, lendingPool, admin);
      const withdrawAmount = ethers.parseUnits("400", await usdc.decimals());
      await expect(
        lendingPool.connect(alice).withdraw(usdcAddress, withdrawAmount),
      )
        .to.emit(lendingPool, "Withdraw")
        .withArgs(alice.address, usdcAddress, withdrawAmount);
      const aliceBalanceAfter = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(aliceBalanceAfter.deposited).to.equal(
        depositAmount - withdrawAmount,
      );
      const usdcMarketAfter = await lendingPool.markets(usdcAddress);
      expect(usdcMarketAfter.totalDeposits).to.equal(
        depositAmount - withdrawAmount,
      );
      const depositIndex = usdcMarketAfter.depositIndex;
      expect(aliceBalanceAfter.depositIndexSnapShot).to.equal(depositIndex);
    });

    it("should return tokens to user wallet after withdrawal", async function () {
      const {
        lendingPool,
        tokens: { usdc },
        signers: { admin, alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();
      const depositAmount = ethers.parseUnits("1000", await usdc.decimals());
      await fundAndDeposit(usdc, alice, depositAmount, lendingPool, admin);
      const withdrawAmount = ethers.parseUnits("400", await usdc.decimals());
      const aliceUsdcBalanceBefore = await usdc.balanceOf(alice);
      await lendingPool.connect(alice).withdraw(usdcAddress, withdrawAmount);
      const aliceUsdcBalanceAfter = await usdc.balanceOf(alice);
      expect(aliceUsdcBalanceAfter).to.equal(
        aliceUsdcBalanceBefore + withdrawAmount,
      );
    });

    it("should cap withdrawal to deposited amount if exceeds it and zero out user balance", async function () {
      const {
        lendingPool,
        tokens: { usdc },
        signers: { admin, alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();
      const depositAmount = ethers.parseUnits("1000", await usdc.decimals());
      await fundAndDeposit(usdc, alice, depositAmount, lendingPool, admin);
      const withdrawAmount = ethers.parseUnits("1100", await usdc.decimals());
      await expect(
        lendingPool.connect(alice).withdraw(usdcAddress, withdrawAmount),
      )
        .to.emit(lendingPool, "Withdraw")
        .withArgs(alice.address, usdcAddress, depositAmount);
      expect(await usdc.balanceOf(alice)).to.equal(depositAmount);
      const aliceBalanceAfter = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(aliceBalanceAfter.deposited).to.equal(0n);
      const usdcMarketAfter = await lendingPool.markets(usdcAddress);
      expect(usdcMarketAfter.totalDeposits).to.equal(0n);
      expect(aliceBalanceAfter.depositIndexSnapShot).to.equal(0n);
    });

    it("should cap withdrawal with collateral if user has borrowings", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const wethAddress = await weth.getAddress();
      const usdcAddress = await usdc.getAddress();
      const aliceDepositAmount = ethers.parseUnits(
        "2000",
        await usdc.decimals(),
      );
      await fundAndDeposit(usdc, alice, aliceDepositAmount, lendingPool, admin);
      const bobDepositAmount = ethers.parseUnits("2000", await weth.decimals());
      await fundAndDeposit(weth, bob, bobDepositAmount, lendingPool, admin);
      const aliceBorrowEthAmount = ethers.parseUnits(
        "0.5",
        await weth.decimals(),
      );
      await lendingPool
        .connect(alice)
        .borrow(wethAddress, aliceBorrowEthAmount);
      await lendingPool.accrueInterest(wethAddress); // sync WETH state
      await lendingPool.accrueInterest(usdcAddress);
      const withdrawAmount = ethers.parseUnits("1500", await usdc.decimals());
      const usdcBalBefore = await usdc.balanceOf(alice.address);
      const depositBefore = await lendingPool.getUserCurrentDeposit(
        alice.address,
        usdcAddress,
      );

      const tx = await lendingPool
        .connect(alice)
        .withdraw(usdcAddress, withdrawAmount);
      await tx.wait();

      const usdcBalAfter = await usdc.balanceOf(alice.address);
      const actualWithdrawn = usdcBalAfter - usdcBalBefore;

      expect(actualWithdrawn).to.be.lt(withdrawAmount);

      const expectedApprox = ethers.parseUnits("750", 6);
      expect(actualWithdrawn).to.be.closeTo(expectedApprox, 50n);

      const depositAfter = await lendingPool.getUserCurrentDeposit(
        alice.address,
        usdcAddress,
      );
      expect(depositAfter).to.be.closeTo(depositBefore - actualWithdrawn, 50n);

      const maxAfter = await lendingPool.getMaxWithdrawAmount(
        alice.address,
        usdcAddress,
      );
      expect(maxAfter).to.be.lt(ethers.parseUnits("1", 6));
    });

    it("should revert properly", async function () {
      const {
        lendingPool,
        protocolController,
        tokens: { usdc },
        signers: { admin, alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const fakeToken = ethers.Wallet.createRandom().address;
      await expect(
        lendingPool.connect(alice).withdraw(fakeToken, 1n),
      ).to.be.revertedWith("Market not supported");
      await fundAndDeposit(
        usdc,
        alice,
        ethers.parseUnits("1000", await usdc.decimals()),
        lendingPool,
        admin,
      );
      await expect(
        lendingPool.connect(alice).withdraw(await usdc.getAddress(), 0n),
      ).to.be.revertedWith("Amount must be greater than zero");
      await protocolController.connect(admin).pauseLendingPool();
      await expect(
        lendingPool
          .connect(alice)
          .withdraw(
            await usdc.getAddress(),
            ethers.parseUnits("100", await usdc.decimals()),
          ),
      ).to.be.revertedWithCustomError(lendingPool, "EnforcedPause");
    });
  });

  describe("borrow", function () {
    const wethCollateral = ethers.parseEther("1");
    const usdcLiquidity = ethers.parseUnits("1000", 6);
    const usdcBorrow = ethers.parseUnits("750", 6);

    it("should allow borrowing within collateral limits, update relevant states and emit Borrow event", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(weth, alice, wethCollateral, lendingPool, admin);
      await fundAndDeposit(usdc, bob, usdcLiquidity, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      const usdcMarketBefore = await lendingPool.markets(usdcAddress);
      expect(usdcMarketBefore.totalBorrows).to.equal(0n);
      expect(usdcMarketBefore.borrowIndex).to.equal(ethers.parseEther("1"));
      await expect(lendingPool.connect(alice).borrow(usdcAddress, usdcBorrow))
        .to.emit(lendingPool, "Borrow")
        .withArgs(alice.address, usdcAddress, usdcBorrow);
      const aliceBorrowBalance = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(aliceBorrowBalance.borrowed).to.equal(usdcBorrow);
      const expectedBorrowBalance = await lendingPool.getUserCurrentBorrow(
        alice.address,
        usdcAddress,
      );
      expect(expectedBorrowBalance).to.equal(usdcBorrow);
      expect(aliceBorrowBalance.borrowIndexSnapShot).to.equal(
        usdcMarketBefore.borrowIndex,
      );
      const usdcMarket = await lendingPool.markets(usdcAddress);
      expect(usdcMarket.totalBorrows).to.equal(
        usdcBorrow + usdcMarketBefore.totalBorrows,
      );
      expect(usdcMarket.borrowIndex).to.equal(ethers.parseEther("1"));
      expect(await lendingPool.userMarkets(alice.address, 1n)).to.equal(
        usdcAddress,
      );
      expect(
        await lendingPool.userMarketExists(alice.address, usdcAddress),
      ).to.equal(true);
    });

    it("should support multi-asset collateral and calculate borrow power correctly", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth, wbtc },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(weth, alice, wethCollateral, lendingPool, admin);
      await fundAndDeposit(usdc, bob, usdcLiquidity, lendingPool, admin);
      const wbtcCollateral = ethers.parseUnits("0.1", 8); // worth $3000
      await fundAndDeposit(wbtc, alice, wbtcCollateral, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await fundAndDeposit(
        usdc,
        bob,
        ethers.parseUnits("5000", 6),
        lendingPool,
        admin,
      );
      const borrowAmount = ethers.parseUnits("2500", 6); // only weth is not enough for this borrow, but with wbtc collateral it should be fine
      await expect(lendingPool.connect(alice).borrow(usdcAddress, borrowAmount))
        .to.emit(lendingPool, "Borrow")
        .withArgs(alice.address, usdcAddress, borrowAmount);
    });

    it("should not allow borrowing that exceeds liquidity", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(weth, alice, wethCollateral, lendingPool, admin);
      await fundAndDeposit(usdc, bob, usdcLiquidity, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await donateToPool(usdc, ethers.parseUnits("500", 6), lendingPool);
      const excessiveBorrow = ethers.parseUnits("2000", 6);
      await expect(
        lendingPool.connect(alice).borrow(usdcAddress, excessiveBorrow),
      ).to.be.revertedWith("Not enough liquidity in the market");
    });

    it("should not allow borrowing that exceeds collateral limits", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(weth, alice, wethCollateral, lendingPool, admin);
      await fundAndDeposit(usdc, bob, usdcLiquidity, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await donateToPool(usdc, ethers.parseUnits("2000", 6), lendingPool);
      const excessiveBorrow = ethers.parseUnits("1900", 6);
      await expect(
        lendingPool.connect(alice).borrow(usdcAddress, excessiveBorrow),
      ).to.be.revertedWith("Insufficient collateral");
    });

    it("should revert properly", async function () {
      const {
        lendingPool,
        protocolController,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(weth, alice, wethCollateral, lendingPool, admin);
      await fundAndDeposit(usdc, bob, usdcLiquidity, lendingPool, admin);
      const fakeToken = ethers.Wallet.createRandom().address;
      await expect(
        lendingPool.connect(alice).borrow(fakeToken, 1n),
      ).to.be.revertedWith("Market not supported");
      await expect(
        lendingPool.connect(alice).borrow(await usdc.getAddress(), 0n),
      ).to.be.revertedWith("Amount must be greater than zero");
      await protocolController.connect(admin).pauseLendingPool();
      await expect(
        lendingPool
          .connect(alice)
          .borrow(await usdc.getAddress(), ethers.parseUnits("100", 6)),
      ).to.be.revertedWithCustomError(lendingPool, "EnforcedPause");
    });
  });

  describe("repay", function () {
    const wethCollateral = ethers.parseEther("1");
    const borrowAmount = ethers.parseUnits("1000", 6);

    it("should allow repaying borrowed amount, update relevant states and emit Repay event", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(weth, alice, wethCollateral, lendingPool, admin);
      await fundAndDeposit(usdc, bob, borrowAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);
      const repayAmount = ethers.parseUnits("400", 6);
      const borrowBefore = (await lendingPool.markets(usdcAddress))
        .totalBorrows;
      const aliceBorrowBefore = (
        await lendingPool.userBalances(alice.address, usdcAddress)
      ).borrowed;
      await usdc.connect(alice).approve(lendingPool.target, repayAmount);
      await expect(lendingPool.connect(alice).repay(usdcAddress, repayAmount))
        .to.emit(lendingPool, "Repay")
        .withArgs(alice.address, usdcAddress, repayAmount);
      const marketAfter = await lendingPool.markets(usdcAddress);
      const balanceAfter = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(marketAfter.totalBorrows).to.be.closeTo(
        borrowBefore - repayAmount,
        50n,
      );
      expect(balanceAfter.borrowed).to.closeTo(
        aliceBorrowBefore - repayAmount,
        50n,
      );
    });

    it("should cap repayment to borrowed amount if exceeds it and zero out user borrow balance", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(weth, alice, wethCollateral, lendingPool, admin);
      await fundAndDeposit(usdc, bob, borrowAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);
      const excessiveRepay = ethers.parseUnits("1100", 6);
      await usdc.connect(admin).mint(alice, excessiveRepay - borrowAmount); // fund alice with enough USDC to cover excessive repay
      console.log(
        "Alice USDC balance before repay:",
        await usdc.balanceOf(alice.address).then((b) => b.toString()),
      );
      await usdc.connect(alice).approve(lendingPool.target, excessiveRepay);
      const repayTx = await lendingPool
        .connect(alice)
        .repay(usdcAddress, excessiveRepay);
      await repayTx.wait();
      const marketAfter = await lendingPool.markets(usdcAddress);
      const balanceAfter = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(marketAfter.totalBorrows).to.be.equal(0n);
      expect(balanceAfter.borrowed).to.be.equal(0n);
      expect(balanceAfter.borrowIndexSnapShot).to.be.equal(0n);
      expect(await usdc.balanceOf(alice.address)).to.closeTo(
        excessiveRepay - borrowAmount,
        50n,
      );
    });

    it("should revert properly", async function () {
      const {
        lendingPool,
        protocolController,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(weth, alice, wethCollateral, lendingPool, admin);
      await fundAndDeposit(usdc, bob, borrowAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await expect(
        lendingPool.connect(alice).repay(usdcAddress, 1n),
      ).to.be.revertedWith("No borrow left");
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);
      const fakeToken = ethers.Wallet.createRandom().address;
      await expect(
        lendingPool.connect(alice).repay(fakeToken, 1n),
      ).to.be.revertedWith("Market not supported");
      await expect(
        lendingPool.connect(alice).repay(usdcAddress, 0n),
      ).to.be.revertedWith("Amount must be greater than zero");
      await protocolController.connect(admin).pauseLendingPool();
      await expect(
        lendingPool
          .connect(alice)
          .repay(usdcAddress, ethers.parseUnits("100", 6)),
      ).to.be.revertedWithCustomError(lendingPool, "EnforcedPause");
    });
  });

  describe("accrueInterest", function () {
    const depositAmount = ethers.parseUnits("1000", 6);
    const borrowAmount = ethers.parseUnits("1000", 6);

    it("should accrue interest correctly over time and update relevant states", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(usdc, bob, depositAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);
      const marketBefore = await lendingPool.markets(usdcAddress);

      await time.increase(24 * 3600);
      await lendingPool.accrueInterest(usdcAddress);

      const marketAfter = await lendingPool.markets(usdcAddress);
      expect(marketAfter.totalBorrows).to.be.gt(marketBefore.totalBorrows);
      expect(marketAfter.borrowIndex).to.be.gt(marketBefore.borrowIndex);
      expect(marketAfter.totalDeposits).to.be.gt(marketBefore.totalDeposits);
      expect(marketAfter.depositIndex).to.be.gt(marketBefore.depositIndex);
    });

    it("should increase user balance over time (via preview)", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(usdc, bob, depositAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);
      const aliceBalanceBefore = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      // increase time by 1 day
      await time.increase(24 * 3600);

      const borrowPreview = await lendingPool.getPreviewUserBorrow(
        alice.address,
        usdcAddress,
      );
      expect(borrowPreview).to.be.gt(aliceBalanceBefore.borrowed);
      const aliceBalanceAfter = await lendingPool.userBalances(
        alice.address,
        usdcAddress,
      );
      expect(aliceBalanceAfter.borrowed).to.equal(aliceBalanceBefore.borrowed);
      const depositPreview = await lendingPool.getPreviewUserDeposit(
        bob.address,
        usdcAddress,
      );
      expect(depositPreview).to.be.gt(depositAmount);
    });

    it("should accrue treasury from borrow-deposit spread", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(usdc, bob, depositAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);
      const treasuryBefore = await lendingPool.treasuryBalances(usdcAddress);
      // increase time by 1 day
      await time.increase(24 * 3600);
      await lendingPool.accrueInterest(usdcAddress);
      const treasuryAfter = await lendingPool.treasuryBalances(usdcAddress);
      expect(treasuryAfter).to.be.gt(treasuryBefore);
    });

    it("should emit Accrue event with correct parameters", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(usdc, bob, depositAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);
      // increase time by 1 day
      await time.increase(24 * 3600);
      await expect(lendingPool.accrueInterest(usdcAddress))
        .to.emit(lendingPool, "Accrue")
        .withArgs(
          usdcAddress,
          ...Array(8)
            .fill(undefined)
            .map(
              async () =>
                (
                  await import(
                    "@nomicfoundation/hardhat-chai-matchers/withArgs"
                  )
                ).anyValue,
            ),
        );
    });

    it("borrowers should pay more interest than depositors earn (ensuring protocol profitability)", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(usdc, bob, depositAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);
      // increase time by 1 day
      await time.increase(24 * 3600);
      const marketBefore = await lendingPool.markets(usdcAddress);
      await lendingPool.accrueInterest(usdcAddress);
      const marketAfter = await lendingPool.markets(usdcAddress);
      const borrowInterest =
        marketAfter.totalBorrows - marketBefore.totalBorrows;
      const depositInterest =
        marketAfter.totalDeposits - marketBefore.totalDeposits;
      expect(borrowInterest).to.be.gt(depositInterest);
    });

    it("should be a no-op if called twice in the same block", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(usdc, bob, depositAmount, lendingPool, admin);
      const usdcAddress = await usdc.getAddress();
      await lendingPool.connect(alice).borrow(usdcAddress, borrowAmount);

      await time.increase(24 * 3600);
      const sameTimestamp = (await time.latest()) + 1;

      await time.setNextBlockTimestamp(sameTimestamp);
      await lendingPool.accrueInterest(usdcAddress);
      const marketAfterFirstAccrue = await lendingPool.markets(usdcAddress);

      await time.setNextBlockTimestamp(sameTimestamp);
      await lendingPool.accrueInterest(usdcAddress);
      const marketAfterSecondAccrue = await lendingPool.markets(usdcAddress);
      expect(marketAfterSecondAccrue.totalBorrows).to.equal(
        marketAfterFirstAccrue.totalBorrows,
      );
      expect(marketAfterSecondAccrue.borrowIndex).to.equal(
        marketAfterFirstAccrue.borrowIndex,
      );
      expect(marketAfterSecondAccrue.totalDeposits).to.equal(
        marketAfterFirstAccrue.totalDeposits,
      );
      expect(marketAfterSecondAccrue.depositIndex).to.equal(
        marketAfterFirstAccrue.depositIndex,
      );
    });
  });

  describe("preview functions", function () {
    it("should return correct preview for user deposit and borrow", async function () {
      const {
        lendingPool,
        liquidation,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();
      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(
        usdc,
        bob,
        ethers.parseUnits("1000", 6),
        lendingPool,
        admin,
      );
      const previewDeposit = await lendingPool.previewDeposit(
        bob.address,
        usdcAddress,
        ethers.parseUnits("100", 6),
      );
      const previewBorrow = await lendingPool.previewBorrow(
        alice.address,
        usdcAddress,
        ethers.parseUnits("500", 6),
      );
      expect(previewDeposit.totalDepositedUSD).to.be.equal(
        ethers.parseUnits("1000", 18),
      );
      expect(previewDeposit.newDepositedUSD).to.be.equal(
        ethers.parseUnits("1100", 18),
      );
      expect(previewBorrow.totalBorrowedUSD).to.be.equal(0n);
      expect(previewBorrow.newBorrowUSD).to.be.equal(
        ethers.parseUnits("500", 18),
      );
      const expectedHealthFactor =
        (previewBorrow.totalDepositedUSD *
          (await liquidation.liquidationThreshold())) /
        previewBorrow.newBorrowUSD;
      expect(previewBorrow.newHealthFactor).to.be.closeTo(
        expectedHealthFactor,
        50n,
      );
    });

    it("should return correct preview for withdraw with active borrow", async function () {
      const {
        lendingPool,
        liquidation,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const wethAddress = await weth.getAddress();
      const usdcAddress = await usdc.getAddress();

      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(
        usdc,
        bob,
        ethers.parseUnits("1000", 6),
        lendingPool,
        admin,
      );
      await lendingPool
        .connect(alice)
        .borrow(usdcAddress, ethers.parseUnits("500", 6));

      const withdrawAmount = ethers.parseEther("0.1"); // 0.1 WETH
      const preview = await lendingPool.previewWithdraw(
        alice.address,
        wethAddress,
        withdrawAmount,
      );

      // Derive expected values from current on-chain state to avoid hardcoding prices
      const {
        totalDepositedUSD: expectedTotalDeposited,
        totalBorrowedUSD: expectedTotalBorrowed,
      } = await lendingPool.getAccountLiquidity(alice.address);

      // Alice deposited exactly 1 WETH (18 decimals), so wethPriceUSD = totalDepositedUSD * 1e18 / 1e18
      const wethPriceUSD = expectedTotalDeposited;
      const withdrawAmountUSD =
        (wethPriceUSD * withdrawAmount) / ethers.parseEther("1");
      const expectedNewDepositedUSD =
        expectedTotalDeposited - withdrawAmountUSD;
      const liquidationThreshold = await liquidation.liquidationThreshold();
      const expectedNewHealthFactor =
        (expectedNewDepositedUSD * liquidationThreshold) /
        expectedTotalBorrowed;

      expect(preview.totalDepositedUSD).to.be.equal(expectedTotalDeposited);
      expect(preview.totalBorrowedUSD).to.be.equal(expectedTotalBorrowed);
      expect(preview.newDepositedUSD).to.be.equal(expectedNewDepositedUSD);
      expect(preview.newHealthFactor).to.be.closeTo(
        expectedNewHealthFactor,
        50n,
      );
    });

    it("should return max health factor for previewWithdraw when user has no borrow", async function () {
      const {
        lendingPool,
        tokens: { usdc },
        signers: { admin, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();

      await fundAndDeposit(
        usdc,
        bob,
        ethers.parseUnits("1000", 6),
        lendingPool,
        admin,
      );

      const preview = await lendingPool.previewWithdraw(
        bob.address,
        usdcAddress,
        ethers.parseUnits("100", 6),
      );

      // USDC price = $1, so: totalDepositedUSD = 1000e18, amountUSD = 100e18
      expect(preview.totalDepositedUSD).to.be.equal(
        ethers.parseUnits("1000", 18),
      );
      expect(preview.totalBorrowedUSD).to.be.equal(0n);
      expect(preview.newDepositedUSD).to.be.equal(ethers.parseUnits("900", 18));
      // Branch: totalBorrowedUSD == 0 → newHealthFactor = type(uint256).max
      expect(preview.newHealthFactor).to.be.equal(ethers.MaxUint256);
    });

    it("should return correct preview for partial repay", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();

      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(
        usdc,
        bob,
        ethers.parseUnits("1000", 6),
        lendingPool,
        admin,
      );
      await lendingPool
        .connect(alice)
        .borrow(usdcAddress, ethers.parseUnits("500", 6));

      // Repay 200 USDC out of 500 USDC borrowed
      const preview = await lendingPool.previewRepay(
        alice.address,
        usdcAddress,
        ethers.parseUnits("200", 6),
      );

      // USDC price = $1: totalBorrowedUSD = 500e18, repayUSD = 200e18 → newBorrowedUSD = 300e18
      expect(preview.totalBorrowedUSD).to.be.equal(
        ethers.parseUnits("500", 18),
      );
      expect(preview.newBorrowedUSD).to.be.equal(ethers.parseUnits("300", 18));
    });

    it("should return zero newBorrowedUSD for previewRepay when amount exceeds total borrow", async function () {
      const {
        lendingPool,
        tokens: { usdc, weth },
        signers: { admin, alice, bob },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const usdcAddress = await usdc.getAddress();

      await fundAndDeposit(
        weth,
        alice,
        ethers.parseEther("1"),
        lendingPool,
        admin,
      );
      await fundAndDeposit(
        usdc,
        bob,
        ethers.parseUnits("1000", 6),
        lendingPool,
        admin,
      );
      await lendingPool
        .connect(alice)
        .borrow(usdcAddress, ethers.parseUnits("500", 6));

      // Repay 600 USDC > 500 USDC borrowed → branch: totalBorrowedUSD < amountUSD → newBorrowedUSD = 0
      const preview = await lendingPool.previewRepay(
        alice.address,
        usdcAddress,
        ethers.parseUnits("600", 6),
      );

      expect(preview.totalBorrowedUSD).to.be.equal(
        ethers.parseUnits("500", 18),
      );
      expect(preview.newBorrowedUSD).to.be.equal(0n);
    });

    it("should revert properly", async function () {
      const {
        lendingPool,
        tokens: { usdc },
        signers: { alice },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      const fakeToken = ethers.Wallet.createRandom().address;
      await expect(
        lendingPool.previewDeposit(alice.address, fakeToken, 1n),
      ).to.be.revertedWith("Market not supported");
      await expect(
        lendingPool.previewBorrow(alice.address, fakeToken, 1n),
      ).to.be.revertedWith("Market not supported");
      await expect(
        lendingPool.previewWithdraw(alice.address, fakeToken, 1n),
      ).to.be.revertedWith("Market not supported");
      await expect(
        lendingPool.previewRepay(alice.address, fakeToken, 1n),
      ).to.be.revertedWith("Market not supported");

      await expect(
        lendingPool.previewDeposit(alice.address, usdc.target, 0n),
      ).to.be.revertedWith("Amount must be greater than zero");
      await expect(
        lendingPool.previewBorrow(alice.address, usdc.target, 0n),
      ).to.be.revertedWith("Amount must be greater than zero");
      await expect(
        lendingPool.previewWithdraw(alice.address, usdc.target, 0n),
      ).to.be.revertedWith("Amount must be greater than zero");
      await expect(
        lendingPool.previewRepay(alice.address, usdc.target, 0n),
      ).to.be.revertedWith("Amount must be greater than zero");
    });
  });
});

describe("initialize - revert cases", function () {
  let LendingPool: LendingPool__factory;
  let validController: string;
  let validLiquidation: string;
  let validPriceRouter: string;
  let validCollateralFactor: bigint;
  before(async function () {
    LendingPool = await ethers.getContractFactory("LendingPool");
    validController = ethers.Wallet.createRandom().address;
    validLiquidation = ethers.Wallet.createRandom().address;
    validPriceRouter = ethers.Wallet.createRandom().address;
    validCollateralFactor = ethers.parseEther("0.75");
  });

  it("should revert if controller address is zero", async function () {
    await expect(
      upgrades.deployProxy(
        LendingPool,
        [
          validLiquidation,
          validPriceRouter,
          validCollateralFactor,
          ethers.ZeroAddress,
        ],
        { initializer: "initialize" },
      ),
    ).to.be.revertedWith("Invalid controller address");
  });

  it("should revert if liquidation address is zero", async function () {
    await expect(
      upgrades.deployProxy(
        LendingPool,
        [
          ethers.ZeroAddress,
          validPriceRouter,
          validCollateralFactor,
          validController,
        ],
        { initializer: "initialize" },
      ),
    ).to.be.revertedWith("Invalid liquidation");
  });

  it("should revert if price router address is zero", async function () {
    await expect(
      upgrades.deployProxy(
        LendingPool,
        [
          validLiquidation,
          ethers.ZeroAddress,
          validCollateralFactor,
          validController,
        ],
        { initializer: "initialize" },
      ),
    ).to.be.revertedWith("Invalid price router");
  });

  it("should revert if collateral factor is zero", async function () {
    await expect(
      upgrades.deployProxy(
        LendingPool,
        [validLiquidation, validPriceRouter, 0n, validController],
        { initializer: "initialize" },
      ),
    ).to.be.revertedWith("Invalid collateral factor");
  });

  it("should revert if collateral factor is greater than 1", async function () {
    const invalidCollateralFactor = ethers.parseEther("1.01");
    await expect(
      upgrades.deployProxy(
        LendingPool,
        [
          validLiquidation,
          validPriceRouter,
          invalidCollateralFactor,
          validController,
        ],
        { initializer: "initialize" },
      ),
    ).to.be.revertedWith("Invalid collateral factor");
  });
});
