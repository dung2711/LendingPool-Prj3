import hardhat from "hardhat";

const { ethers, upgrades } = hardhat;

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployProtocolWithMarketsFixture } from "./Fixture.test";

describe("ProtocolController", function () {
  describe("constructor", function () {
    const validAddress = "0x0000000000000000000000000000000000000001";

    it("should set the correct owner and params", async function () {
      const {
        protocolController,
        lendingPool,
        myOracle,
        priceRouter,
        liquidation,
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      expect(await protocolController.lendingPool()).to.equal(
        lendingPool.target,
      );
      expect(await protocolController.myOracle()).to.equal(myOracle.target);
      expect(await protocolController.priceRouter()).to.equal(
        priceRouter.target,
      );
      expect(await protocolController.liquidation()).to.equal(
        liquidation.target,
      );
      expect(
        await protocolController.hasRole(
          await protocolController.DEFAULT_ADMIN_ROLE(),
          admin.address,
        ),
      ).to.equal(true);
    });

    it("should revert if lending pool address is zero", async function () {
      const ProtocolController =
        await ethers.getContractFactory("ProtocolController");
      await expect(
        ProtocolController.deploy(
          ethers.ZeroAddress,
          validAddress,
          validAddress,
          validAddress,
          validAddress,
        ),
      ).to.be.revertedWith("Invalid lending pool");
    });

    it("should revert if PriceRouter address is zero", async function () {
      const ProtocolController =
        await ethers.getContractFactory("ProtocolController");
      await expect(
        ProtocolController.deploy(
          validAddress,
          ethers.ZeroAddress,
          validAddress,
          validAddress,
          validAddress,
        ),
      ).to.be.revertedWith("Invalid price router");
    });

    it("should revert if MyOracle address is zero", async function () {
      const ProtocolController =
        await ethers.getContractFactory("ProtocolController");
      await expect(
        ProtocolController.deploy(
          validAddress,
          validAddress,
          ethers.ZeroAddress,
          validAddress,
          validAddress,
        ),
      ).to.be.revertedWith("Invalid oracle");
    });

    it("should revert if Liquidation address is zero", async function () {
      const ProtocolController =
        await ethers.getContractFactory("ProtocolController");
      await expect(
        ProtocolController.deploy(
          validAddress,
          validAddress,
          validAddress,
          ethers.ZeroAddress,
          validAddress,
        ),
      ).to.be.revertedWith("Invalid liquidation");
    });

    it("should revert if admin address is zero", async function () {
      const ProtocolController =
        await ethers.getContractFactory("ProtocolController");
      await expect(
        ProtocolController.deploy(
          validAddress,
          validAddress,
          validAddress,
          validAddress,
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWith("Invalid admin");
    });
  });

  describe("update addresses in the protocol", function () {
    const validAddress = "0x0000000000000000000000000000000000000001";
    it("can migrate controller properly", async function () {
      const {
        protocolController,
        lendingPool,
        liquidation,
        priceRouter,
        myOracle,
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController.connect(admin).migrateController(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid controller address");
      await expect(
        protocolController.connect(admin).migrateController(validAddress),
      )
        .to.emit(protocolController, "ControllerMigrated")
        .withArgs(protocolController.target, validAddress);
      expect(await lendingPool.controller()).to.be.equal(validAddress);
      expect(await liquidation.controller()).to.be.equal(validAddress);
      expect(await priceRouter.controller()).to.be.equal(validAddress);
      expect(await myOracle.controller()).to.be.equal(validAddress);
    });

    it("can set lending pool address properly", async function () {
      const {
        protocolController,
        liquidation,
        lendingPool,
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController.connect(admin).setLendingPool(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid lending pool");
      await expect(
        protocolController.connect(admin).setLendingPool(validAddress),
      )
        .to.emit(protocolController, "LendingPoolUpdated")
        .withArgs(lendingPool.target, validAddress);
      expect(await protocolController.lendingPool()).to.be.equal(validAddress);
      expect(await liquidation.lendingPool()).to.be.equal(validAddress);
    });

    it("can set price router address properly", async function () {
      const {
        protocolController,
        lendingPool,
        liquidation,
        priceRouter,
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController.connect(admin).setPriceRouter(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid price router");
      await expect(
        protocolController.connect(admin).setPriceRouter(validAddress),
      )
        .to.emit(protocolController, "PriceRouterUpdated")
        .withArgs(priceRouter.target, validAddress);
      expect(await protocolController.priceRouter()).to.be.equal(validAddress);
      expect(await lendingPool.priceRouter()).to.be.equal(validAddress);
      expect(await liquidation.priceRouter()).to.be.equal(validAddress);
    });

    it("can set oracle address properly", async function () {
      const {
        protocolController,
        priceRouter,
        myOracle,
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController.connect(admin).setMyOracle(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid oracle");
      await expect(protocolController.connect(admin).setMyOracle(validAddress))
        .to.emit(protocolController, "MyOracleUpdated")
        .withArgs(myOracle.target, validAddress);
      expect(await protocolController.myOracle()).to.be.equal(validAddress);
      expect(await priceRouter.myOracle()).to.be.equal(validAddress);
    });

    it("can set liquidation address properly", async function () {
      const {
        protocolController,
        lendingPool,
        liquidation,
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController.connect(admin).setLiquidation(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid liquidation");
      await expect(
        protocolController.connect(admin).setLiquidation(validAddress),
      )
        .to.emit(protocolController, "LiquidationUpdated")
        .withArgs(liquidation.target, validAddress);
      expect(await protocolController.liquidation()).to.be.equal(validAddress);
      expect(await lendingPool.liquidation()).to.be.equal(validAddress);
    });
  });

  describe("price router functions", function () {
    const validAddress = "0x0000000000000000000000000000000000000001";
    const enum Source {
      CHAINLINK,
      MYORACLE,
      NONE,
    }
    it("should set chainlink price feed for an asset", async function () {
      const {
        protocolController,
        priceRouter,
        tokens: { usdc },
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      await expect(
        protocolController
          .connect(admin)
          .setChainlinkFeed(usdc.target, validAddress),
      )
        .to.emit(priceRouter, "FeedSet")
        .withArgs(usdc.target, validAddress, Source.CHAINLINK);
      const feed = await priceRouter.feeds(usdc.target);
      expect(feed.feedOrToken).to.equal(validAddress);
      expect(feed.source).to.equal(Source.CHAINLINK);
    });

    it("should set my oracle as price source for an asset", async function () {
      const {
        protocolController,
        priceRouter,
        tokens: { usdc },
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      await expect(
        protocolController.connect(admin).setMyOracleFeed(usdc.target),
      )
        .to.emit(priceRouter, "FeedSet")
        .withArgs(usdc.target, usdc.target, Source.MYORACLE);
      const feed = await priceRouter.feeds(usdc.target);
      expect(feed.feedOrToken).to.equal(usdc.target);
      expect(feed.source).to.equal(Source.MYORACLE);
    });

    it("should remove feed for an asset", async function () {
      const {
        protocolController,
        priceRouter,
        tokens: { usdc },
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);

      // First set a feed
      await protocolController
        .connect(admin)
        .setChainlinkFeed(usdc.target, validAddress);

      // Then remove it
      await expect(protocolController.connect(admin).removeFeed(usdc.target))
        .to.emit(priceRouter, "FeedRemoved")
        .withArgs(usdc.target);
      const feed = await priceRouter.feeds(usdc.target);
      expect(feed.feedOrToken).to.equal(ethers.ZeroAddress);
      expect(feed.source).to.equal(Source.NONE);
    });
  });

  describe("liquidation functions", function () {
    it("can set parameters properly", async function () {
      const {
        protocolController,
        liquidation,
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController
          .connect(admin)
          .setLiquidateParams(1n, 1n, ethers.parseUnits("0.1", 18)),
      )
        .to.emit(liquidation, "LiquidationParamsUpdated")
        .withArgs(1n, 1n, ethers.parseUnits("0.1", 18));
      expect(await liquidation.liquidationIncentive()).to.be.equal(
        ethers.parseUnits("0.1", 18),
      );
      expect(await liquidation.liquidationThreshold()).to.be.equal(1n);
      expect(await liquidation.closeFactor()).to.be.equal(1n);
    });

    it("should revert if parameters are invalid", async function () {
      const {
        protocolController,
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController
          .connect(admin)
          .setLiquidateParams(0n, 1n, ethers.parseUnits("0.1", 18)),
      ).to.be.revertedWith("Invalid threshold");
      await expect(
        protocolController
          .connect(admin)
          .setLiquidateParams(
            ethers.parseUnits("1.1", 18),
            1n,
            ethers.parseUnits("0.1", 18),
          ),
      ).to.be.revertedWith("Invalid threshold");
      await expect(
        protocolController
          .connect(admin)
          .setLiquidateParams(
            1n,
            ethers.parseUnits("1.1", 18),
            ethers.parseUnits("0.1", 18),
          ),
      ).to.be.revertedWith("Invalid close factor");
      await expect(
        protocolController
          .connect(admin)
          .setLiquidateParams(1n, 0n, ethers.parseUnits("0.1", 18)),
      ).to.be.revertedWith("Invalid close factor");
      await expect(
        protocolController
          .connect(admin)
          .setLiquidateParams(1n, 1n, ethers.parseUnits("0.3", 18)),
      ).to.be.revertedWith("Incentive too high");
    });
  });

  describe("my oracle functions", function () {
    it("can set parameters properly", async function () {
      const {
        protocolController,
        myOracle,
        tokens: { usdc },
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController
          .connect(admin)
          .setPrice(usdc, ethers.parseUnits("1", 18)),
      )
        .to.emit(myOracle, "PriceUpdated")
        .withArgs(usdc.target, ethers.parseUnits("1", 18));
      expect(await myOracle.prices(usdc.target)).to.be.equal(
        ethers.parseUnits("1", 18),
      );
      expect(await myOracle.getPriceMyOracle(usdc.target)).to.be.equal(
        ethers.parseUnits("1", 18),
      );
    });

    it("should revert properly", async function () {
      const {
        protocolController,
        myOracle,
        tokens: { usdc },
        signers: { admin },
      } = await loadFixture(deployProtocolWithMarketsFixture);
      await expect(
        protocolController.connect(admin).setPrice(usdc, 0n),
      ).to.be.revertedWith("Price must be greater than zero");
      await expect(
        protocolController
          .connect(admin)
          .setPrice(ethers.ZeroAddress, ethers.parseUnits("1", 18)),
      ).to.be.revertedWith("Invalid asset address");
      const fakeToken = ethers.Wallet.createRandom().address;
      await expect(myOracle.getPriceMyOracle(fakeToken)).to.be.revertedWith(
        "Price not set",
      );
    });
  });

  describe("lending pool functions", function () {
    describe("pauseLendingPool", function () {
      it("should pause the lending pool", async function () {
        const {
          protocolController,
          lendingPool,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController.connect(admin).pauseLendingPool(),
        ).to.emit(lendingPool, "Paused");
        expect(await lendingPool.paused()).to.equal(true);
      });

      it("should prevent non-admin from pausing", async function () {
        const {
          protocolController,
          signers: { alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(protocolController.connect(alice).pauseLendingPool()).to.be
          .reverted;
      });
    });

    describe("unpauseLendingPool", function () {
      it("should unpause the lending pool", async function () {
        const {
          protocolController,
          lendingPool,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        // First pause
        await protocolController.connect(admin).pauseLendingPool();
        expect(await lendingPool.paused()).to.equal(true);

        // Then unpause
        await expect(
          protocolController.connect(admin).unpauseLendingPool(),
        ).to.emit(lendingPool, "Unpaused");
        expect(await lendingPool.paused()).to.equal(false);
      });
    });

    describe("supportMarket", function () {
      it("should support a new market", async function () {
        const {
          protocolController,
          lendingPool,
          stableCoinIRM,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const newToken = await MockERC20.deploy("New Token", "NEW", 18);
        await newToken.waitForDeployment();

        await expect(
          protocolController
            .connect(admin)
            .supportMarket(newToken.target, stableCoinIRM.target),
        )
          .to.emit(lendingPool, "MarketSupported")
          .withArgs(newToken.target, stableCoinIRM.target);
      });

      it("should update interest rate model for existing market", async function () {
        const {
          protocolController,
          lendingPool,
          stableCoinIRM,
          volatileCoinIRM,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        // First support market with stableCoinIRM
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const newToken = await MockERC20.deploy("New Token", "NEW", 18);
        await newToken.waitForDeployment();

        await protocolController
          .connect(admin)
          .supportMarket(newToken.target, stableCoinIRM.target);

        // Then update with volatileCoinIRM
        await expect(
          protocolController
            .connect(admin)
            .supportMarket(newToken.target, volatileCoinIRM.target),
        )
          .to.emit(lendingPool, "MarketSupported")
          .withArgs(newToken.target, volatileCoinIRM.target);
      });
    });

    describe("unsupportMarket", function () {
      it("should unsupport a market", async function () {
        const {
          protocolController,
          lendingPool,
          tokens: { usdc },
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController.connect(admin).unsupportMarket(usdc.target),
        )
          .to.emit(lendingPool, "MarketUnsupported")
          .withArgs(usdc.target);
      });
    });

    describe("setCollateralParams", function () {
      it("should set collateral factor", async function () {
        const {
          protocolController,
          lendingPool,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const newCollateralFactor = ethers.parseEther("0.8");

        await expect(
          protocolController
            .connect(admin)
            .setCollateralParams(newCollateralFactor),
        )
          .to.emit(lendingPool, "CollateralFactorUpdated")
          .withArgs(newCollateralFactor);

        expect(await lendingPool.collateralFactor()).to.equal(
          newCollateralFactor,
        );
      });

      it("should revert if collateral factor is zero", async function () {
        const {
          protocolController,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController.connect(admin).setCollateralParams(0n),
        ).to.be.revertedWith("Invalid collateral factor");
      });

      it("should revert if collateral factor exceeds SCALE", async function () {
        const {
          protocolController,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const SCALE = ethers.parseEther("1");
        const exceedsScale = SCALE + 1n;

        await expect(
          protocolController.connect(admin).setCollateralParams(exceedsScale),
        ).to.be.revertedWith("Invalid collateral factor");
      });
    });

    describe("setInterestRateModelBatch", function () {
      it("should set interest rate model for multiple assets", async function () {
        const {
          protocolController,
          stableCoinIRM,
          tokens: { usdc, weth, wbtc },
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const assets = [usdc.target, weth.target, wbtc.target];

        // Set multiple assets to use the same IRM
        await expect(
          protocolController
            .connect(admin)
            .setInterestRateModelBatch(assets, stableCoinIRM.target),
        ).to.not.be.reverted;
      });

      it("should revert with invalid IRM address", async function () {
        const {
          protocolController,
          tokens: { usdc, weth },
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const assets = [usdc.target, weth.target];

        await expect(
          protocolController
            .connect(admin)
            .setInterestRateModelBatch(assets, ethers.ZeroAddress),
        ).to.be.revertedWith("Invalid IRM");
      });

      it("should revert with empty assets array", async function () {
        const {
          protocolController,
          stableCoinIRM,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(admin)
            .setInterestRateModelBatch([], stableCoinIRM.target),
        ).to.be.revertedWith("Empty assets array");
      });
    });

    describe("donate", function () {
      it("should allow user to donate to the treasury", async function () {
        const {
          lendingPool,
          tokens: { usdc },
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const donateAmount = ethers.parseUnits("1000", 6);

        // Mint tokens to alice
        await usdc.connect(admin).mint(alice.address, donateAmount);
        await usdc.connect(alice).approve(lendingPool.target, donateAmount);

        await expect(
          lendingPool.connect(alice).donate(usdc.target, donateAmount),
        )
          .to.emit(lendingPool, "Donated")
          .withArgs(alice.address, usdc.target, donateAmount);
      });

      it("should revert if amount is zero", async function () {
        const {
          lendingPool,
          tokens: { usdc },
          signers: { alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          lendingPool.connect(alice).donate(usdc.target, 0n),
        ).to.be.revertedWith("Amount must be greater than zero");
      });

      it("should revert if market not supported", async function () {
        const {
          lendingPool,
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const unsupportedToken = await MockERC20.deploy(
          "Unsupported",
          "UNS",
          18,
        );
        await unsupportedToken.waitForDeployment();

        const donateAmount = ethers.parseUnits("1000", 18);
        await unsupportedToken.connect(admin).mint(alice.address, donateAmount);
        await unsupportedToken
          .connect(alice)
          .approve(lendingPool.target, donateAmount);

        await expect(
          lendingPool
            .connect(alice)
            .donate(unsupportedToken.target, donateAmount),
        ).to.be.revertedWith("Market not supported");
      });

      it("should revert when pool is paused", async function () {
        const {
          protocolController,
          lendingPool,
          tokens: { usdc },
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await protocolController.connect(admin).pauseLendingPool();

        const donateAmount = ethers.parseUnits("1000", 6);
        await usdc.connect(admin).mint(alice.address, donateAmount);
        await usdc.connect(alice).approve(lendingPool.target, donateAmount);

        await expect(
          lendingPool.connect(alice).donate(usdc.target, donateAmount),
        ).to.be.revertedWithCustomError(lendingPool, "EnforcedPause");
      });
    });

    describe("withdrawTreasury", function () {
      it("should withdraw from treasury", async function () {
        const {
          protocolController,
          lendingPool,
          tokens: { usdc },
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const donateAmount = ethers.parseUnits("1000", 6);
        const withdrawAmount = ethers.parseUnits("500", 6);

        // First donate to treasury
        await usdc.connect(admin).mint(admin.address, donateAmount);
        await usdc.connect(admin).approve(lendingPool.target, donateAmount);
        await lendingPool.connect(admin).donate(usdc.target, donateAmount);

        // Then withdraw
        await expect(
          protocolController
            .connect(admin)
            .withdrawTreasury(usdc.target, alice.address, withdrawAmount),
        )
          .to.emit(lendingPool, "TreasuryWithdrawn")
          .withArgs(usdc.target, alice.address, withdrawAmount);

        // Verify alice received the tokens
        expect(await usdc.balanceOf(alice.address)).to.equal(withdrawAmount);
      });

      it("should revert if amount is zero", async function () {
        const {
          protocolController,
          tokens: { usdc },
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(admin)
            .withdrawTreasury(usdc.target, alice.address, 0n),
        ).to.be.revertedWith("Amount must be greater than zero");
      });

      it("should revert if recipient is zero address", async function () {
        const {
          protocolController,
          tokens: { usdc },
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(admin)
            .withdrawTreasury(usdc.target, ethers.ZeroAddress, 100n),
        ).to.be.revertedWith("Invalid recipient");
      });

      it("should revert if amount exceeds treasury balance", async function () {
        const {
          protocolController,
          tokens: { usdc },
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const excessAmount = ethers.parseUnits("10000000", 6);

        await expect(
          protocolController
            .connect(admin)
            .withdrawTreasury(usdc.target, alice.address, excessAmount),
        ).to.be.revertedWith("Exceeds treasury balance");
      });

      it("should prevent non-admin from withdrawing", async function () {
        const {
          protocolController,
          tokens: { usdc },
          signers: { alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(alice)
            .withdrawTreasury(usdc.target, alice.address, 100n),
        ).to.be.reverted;
      });
    });

    describe("rescueToken", function () {
      it("should rescue surplus tokens from the pool", async function () {
        const {
          protocolController,
          lendingPool,
          tokens: { usdc },
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        // Send excess tokens directly to the pool (not through normal operations)
        const surplusAmount = ethers.parseUnits("100", 6);
        await usdc.connect(admin).transfer(lendingPool.target, surplusAmount);

        // Rescue the surplus
        await expect(
          protocolController
            .connect(admin)
            .rescueToken(usdc.target, alice.address, surplusAmount),
        )
          .to.emit(lendingPool, "TokenRescued")
          .withArgs(usdc.target, alice.address, surplusAmount);

        // Verify alice received the tokens
        expect(await usdc.balanceOf(alice.address)).to.equal(surplusAmount);
      });

      it("should revert if amount is zero", async function () {
        const {
          protocolController,
          tokens: { usdc },
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(admin)
            .rescueToken(usdc.target, alice.address, 0n),
        ).to.be.revertedWith("Amount must be greater than zero");
      });

      it("should revert if recipient is zero address", async function () {
        const {
          protocolController,
          tokens: { usdc },
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(admin)
            .rescueToken(usdc.target, ethers.ZeroAddress, 100n),
        ).to.be.revertedWith("Invalid recipient");
      });

      it("should revert if amount exceeds surplus", async function () {
        const {
          protocolController,
          tokens: { usdc },
          signers: { admin, alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        // Try to rescue more than what's available
        const excessAmount = ethers.parseUnits("10000000", 6);

        await expect(
          protocolController
            .connect(admin)
            .rescueToken(usdc.target, alice.address, excessAmount),
        ).to.be.revertedWith("Amount exceeds surplus");
      });

      it("should prevent non-admin from rescuing", async function () {
        const {
          protocolController,
          tokens: { usdc },
          signers: { alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(alice)
            .rescueToken(usdc.target, alice.address, 100n),
        ).to.be.reverted;
      });
    });
  });

  describe("proxy upgrade functions", function () {
    describe("upgradePriceRouter", function () {
      it("should revert if newImplementation is zero address", async function () {
        const {
          protocolController,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(admin)
            .upgradePriceRouter(ethers.ZeroAddress),
        ).to.be.revertedWith("Invalid implementation");
      });

      it("should prevent non-admin from upgrading", async function () {
        const {
          protocolController,
          signers: { alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const validAddress = "0x0000000000000000000000000000000000000001";

        await expect(
          protocolController.connect(alice).upgradePriceRouter(validAddress),
        ).to.be.reverted;
      });

      it("should emit PriceRouterUpgraded event on successful upgrade", async function () {
        const {
          protocolController,
          priceRouter,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        // Deploy a mock new implementation
        const PriceRouter = await ethers.getContractFactory("PriceRouter");
        const newImplementation = await PriceRouter.deploy();
        await newImplementation.waitForDeployment();

        await expect(
          protocolController
            .connect(admin)
            .upgradePriceRouter(newImplementation.target),
        )
          .to.emit(protocolController, "PriceRouterUpgraded")
          .withArgs(newImplementation.target);
        expect(
          await upgrades.erc1967.getImplementationAddress(
            priceRouter.target.toString(),
          ),
        ).to.equal(newImplementation.target);
      });
    });

    describe("upgradeLendingPool", function () {
      it("should revert if newImplementation is zero address", async function () {
        const {
          protocolController,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        await expect(
          protocolController
            .connect(admin)
            .upgradeLendingPool(ethers.ZeroAddress),
        ).to.be.revertedWith("Invalid implementation");
      });

      it("should prevent non-admin from upgrading", async function () {
        const {
          protocolController,
          signers: { alice },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        const validAddress = "0x0000000000000000000000000000000000000001";

        await expect(
          protocolController.connect(alice).upgradeLendingPool(validAddress),
        ).to.be.reverted;
      });

      it("should emit LendingPoolUpgraded event on successful upgrade", async function () {
        const {
          protocolController,
          lendingPool,
          signers: { admin },
        } = await loadFixture(deployProtocolWithMarketsFixture);

        // Deploy a mock new implementation
        const LendingPool = await ethers.getContractFactory("LendingPool");
        const newImplementation = await LendingPool.deploy();
        await newImplementation.waitForDeployment();

        await expect(
          protocolController
            .connect(admin)
            .upgradeLendingPool(newImplementation.target),
        )
          .to.emit(protocolController, "LendingPoolUpgraded")
          .withArgs(newImplementation.target);
        expect(
          await upgrades.erc1967.getImplementationAddress(
            lendingPool.target.toString(),
          ),
        ).to.equal(newImplementation.target);
      });
    });
  });
});
