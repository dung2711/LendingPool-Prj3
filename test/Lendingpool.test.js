import { expect } from "chai";
import pkg from "@nomicfoundation/hardhat-ignition/modules";
const { loadModule } = pkg;
import hardhat from "hardhat";
const { ethers, ignition } = hardhat;
import { describe, it, beforeEach } from "mocha";
import LendingPoolProtocol from "../ignition/modules/LendingPoolProtocol.js";


let myToken;
let myOracle;
let priceRouter;
let interestRateModel;
let liquidation;
let lendingPool;
beforeEach(async () => {
    const module = await ignition.deploy(LendingPoolProtocol);
    myToken = module.myToken;
    myOracle = module.myOracle;
    priceRouter = module.priceRouter;
    interestRateModel = module.interestRateModel;
    liquidation = module.liquidation;
    lendingPool = module.lendingPool;
})

describe("LendingPoolProtocol", () => {
    it("deploys all contracts", async () => {
      expect(await myToken.getAddress()).to.be.properAddress;
      expect(await myOracle.getAddress()).to.be.properAddress;
      expect(await priceRouter.getAddress()).to.be.properAddress;
      expect(await interestRateModel.getAddress()).to.be.properAddress;
      expect(await liquidation.getAddress()).to.be.properAddress;
      expect(await lendingPool.getAddress()).to.be.properAddress;
    });

    it("sets up MyToken parameters correctly and can mint properly", async () => {
      expect(await myToken.name()).to.equal("MyToken");
      expect(await myToken.symbol()).to.equal("VNDT");
      expect(await priceRouter.getPrice(myToken)).to.equal(ethers.parseUnits("1", 18));
      const [owner] = await ethers.getSigners();
      const amountMintedToOwner = 1000000n;
      expect(await myToken.balanceOf(owner.address)).to.equal(ethers.parseUnits(amountMintedToOwner.toString(), 18));
      await myToken.mint(owner.address, ethers.parseUnits("1000", 18));
      expect(await myToken.balanceOf(owner.address)).to.equal(ethers.parseUnits((amountMintedToOwner + 1000n).toString(), 18));
    });

    it("sets up PriceRouter and MyOracle parameters correctly and they behave as expected", async () => {
      // Set and get price from MyOracle via PriceRouter
      expect(await myOracle.getPriceMyOracle(myToken)).to.equal(ethers.parseUnits("1", 18));
      expect(await priceRouter.getPrice(myToken)).to.equal(ethers.parseUnits("1", 18));
      const tx = await myOracle.setPrice(myToken, ethers.parseUnits("2", 18));
      expect(await myOracle.getPriceMyOracle(myToken)).to.equal(ethers.parseUnits("2", 18));
      expect(await priceRouter.getPrice(myToken)).to.equal(ethers.parseUnits("2", 18));
      expect(tx).to.emit(myOracle, "PriceUpdated").withArgs(myToken, ethers.parseUnits("2", 18));

      // Set MyOracle feed in PriceRouter
      expect(await priceRouter.myOracle()).to.equal(await myOracle.getAddress());
      const tx1 = await priceRouter.removeFeed(myToken);
      expect(tx1).to.emit(priceRouter, "FeedRemoved").withArgs(myToken);
      await expect(priceRouter.getPrice(myToken)).to.be.reverted;
      const tx2 = await priceRouter.setMyOracleFeed(myToken);
      expect(tx2).to.emit(priceRouter, "FeedSet").withArgs(myToken, myOracle);
      expect(await priceRouter.getPrice(myToken)).to.equal(ethers.parseUnits("2", 18));
    });

    it("sets up InterestRateModel parameters correctly", async () => {
      expect(await interestRateModel.baseRate()).to.equal(ethers.parseUnits("0.02", 18));
      expect(await interestRateModel.rateSlope1()).to.equal(ethers.parseUnits("0.08", 18));
      expect(await interestRateModel.rateSlope2()).to.equal(ethers.parseUnits("1", 18));
      expect(await interestRateModel.optimalUtilization()).to.equal(ethers.parseUnits("0.8", 18));
      expect(await interestRateModel.reserveFactor()).to.equal(ethers.parseUnits("0.1", 18));
      expect(await interestRateModel.lendingPool()).to.equal(await lendingPool.getAddress());
    });

    it("sets up LendingPool parameters correctly", async () => {
      expect(await lendingPool.priceRouter()).to.equal(await priceRouter.getAddress());
      expect(await lendingPool.liquidation()).to.equal(await liquidation.getAddress());
      expect(await lendingPool.collateralFactor()).to.equal(ethers.parseUnits("0.8", 18));
      const tokenMarket = await lendingPool.markets(myToken);
      expect(tokenMarket.isSupported).to.equal(true);
      expect(tokenMarket.interestRateModel).to.equal(await interestRateModel.getAddress());
      expect(tokenMarket.totalBorrows).to.equal(0n);
      expect(tokenMarket.totalDeposits).to.equal(0n);
      expect(tokenMarket.depositIndex).to.equal(ethers.parseUnits("1", 18));
      expect(tokenMarket.borrowIndex).to.equal(ethers.parseUnits("1", 18));
      const timeStamp = (await ethers.provider.getBlock()).timestamp;
      expect(tokenMarket.lastUpdateTimestamp).to.be.at.least(timeStamp - 5); // allow for slight delay
      expect(await lendingPool.allMarkets(0)).to.equal(myToken);
      expect(await lendingPool.marketExists(myToken)).to.equal(true);
    });

    it("sets up Liquidation parameters correctly", async () => {
      expect(await liquidation.priceRouter()).to.equal(await priceRouter.getAddress());
      expect(await liquidation.lendingPool()).to.equal(await lendingPool.getAddress());
      expect(await liquidation.liquidationThreshold()).to.equal(ethers.parseUnits("0.9", 18));
      expect(await liquidation.closeFactor()).to.equal(ethers.parseUnits("0.5", 18));
      expect(await liquidation.liquidationIncentive()).to.equal(ethers.parseUnits("0.05", 18));
    });

    it("can support and unsupport markets properly", async () => {
      const tx = await lendingPool.supportMarket("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", interestRateModel);
      expect(tx).to.emit(lendingPool, "MarketSupported").withArgs("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", interestRateModel);
      const market = await lendingPool.markets("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
      expect(market.isSupported).to.equal(true);
      expect(market.interestRateModel).to.equal(interestRateModel);
      expect(await lendingPool.marketExists("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238")).to.equal(true);
      const tx2 = await lendingPool.unsupportMarket("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
      expect(tx2).to.emit(lendingPool, "MarketUnsupported").withArgs("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
      const market2 = await lendingPool.markets("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
      expect(market2.isSupported).to.equal(false);
    });

    it("can deposit, borrow, withdraw and repay properly", async () => {
      const [owner, addr1] = await ethers.getSigners();
      const myTokenMarket = await lendingPool.markets(myToken);
      expect(myTokenMarket.totalDeposits).to.equal(0n);
      expect(myTokenMarket.totalBorrows).to.equal(0n);
      expect(await myToken.balanceOf(owner.address)).to.equal(ethers.parseUnits("1000000", 18));

      //Deposit
      await myToken.approve(lendingPool, ethers.parseUnits("1000", 18));
      const tx = await lendingPool.deposit(myToken, ethers.parseUnits("1000", 18));
      expect(tx).to.emit(lendingPool, "Deposit").withArgs(owner.address, myToken, ethers.parseUnits("1000", 18));
      const marketAfterDeposit = await lendingPool.markets(myToken);
      expect(marketAfterDeposit.totalDeposits).to.equal(ethers.parseUnits("1000", 18));
      expect(await myToken.balanceOf(owner.address)).to.equal(ethers.parseUnits("999000", 18));
      expect((await lendingPool.userBalances(owner.address, myToken)).deposited).to.equal(ethers.parseUnits("1000", 18));
      expect(await lendingPool.userMarkets(owner.address, 0)).to.equal(myToken);
      expect(await lendingPool.userMarketExists(owner.address, myToken)).to.equal(true);
      expect((await lendingPool.userBalances(owner.address, myToken)).depositIndexSnapShot).to.equal(marketAfterDeposit.depositIndex);

      //Borrow
      await expect(lendingPool.borrow(myToken, ethers.parseUnits("900", 18))).to.be.revertedWith("Insufficient collateral");
      const tx2 = await lendingPool.borrow(myToken, ethers.parseUnits("500", 18));
      expect(tx2).to.emit(lendingPool, "Borrow").withArgs(owner.address, myToken, ethers.parseUnits("500", 18));
      const marketAfterBorrow = await lendingPool.markets(myToken);
      expect(marketAfterBorrow.totalBorrows).to.equal(ethers.parseUnits("500", 18));
      expect(await myToken.balanceOf(owner.address)).to.equal(ethers.parseUnits("999500", 18));
      expect((await lendingPool.userBalances(owner.address, myToken)).borrowed).to.equal(ethers.parseUnits("500", 18));
      expect((await lendingPool.userBalances(owner.address, myToken)).borrowIndexSnapShot).to.equal(marketAfterBorrow.borrowIndex);

      //Repay partially
      await myToken.approve(lendingPool, ethers.parseUnits("200", 18));
      const tx3 = await lendingPool.repay(myToken, ethers.parseUnits("200", 18));
      expect(tx3).to.emit(lendingPool, "Repay").withArgs(owner.address, myToken, ethers.parseUnits("200", 18));
      const marketAfterRepay = await lendingPool.markets(myToken);
      expect(marketAfterRepay.totalBorrows).to.be.closeTo(ethers.parseUnits("300", 18), ethers.parseUnits("0.001", 18));
      expect(await myToken.balanceOf(owner.address)).to.equal(ethers.parseUnits("999300", 18));
      expect((await lendingPool.userBalances(owner.address, myToken)).borrowed).to.be.closeTo(ethers.parseUnits("300", 18), ethers.parseUnits("0.001", 18));
      expect((await lendingPool.userBalances(owner.address, myToken)).borrowIndexSnapShot).to.equal(marketAfterRepay.borrowIndex);


      //Withdraw partially
      const tx5 = await lendingPool.withdraw(myToken, ethers.parseUnits("400", 18));
      expect(tx5).to.emit(lendingPool, "Withdraw").withArgs(owner.address, myToken, ethers.parseUnits("400", 18));
      const marketAfterWithdraw = await lendingPool.markets(myToken);
      expect(marketAfterWithdraw.totalDeposits).to.be.closeTo(ethers.parseUnits("600", 18), ethers.parseUnits("0.001", 18));
      expect(await myToken.balanceOf(owner.address)).to.equal(ethers.parseUnits("999700", 18));
      expect((await lendingPool.userBalances(owner.address, myToken)).deposited).to.be.closeTo(ethers.parseUnits("600", 18), ethers.parseUnits("0.001", 18));
      expect((await lendingPool.userBalances(owner.address, myToken)).depositIndexSnapShot).to.equal(marketAfterWithdraw.depositIndex);
    });

    it("can accrue interest properly", async () => {
      const [owner] = await ethers.getSigners();
      
      //Deposit
      await myToken.approve(lendingPool, ethers.parseUnits("1000", 18));
      await lendingPool.deposit(myToken, ethers.parseUnits("1000", 18));

      //Borrow
      await lendingPool.borrow(myToken, ethers.parseUnits("500", 18));

      const marketBefore = await lendingPool.markets(myToken);
      expect(marketBefore.totalDeposits).to.equal(ethers.parseUnits("1000", 18));
      expect(marketBefore.totalBorrows).to.equal(ethers.parseUnits("500", 18));

      //Advance time by 1 year
      const oneYear = 365 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneYear]);
      await ethers.provider.send("evm_mine", []);

      //Calculate expected interest
      const borrowRate = await interestRateModel.getBorrowRate(myToken);
      const depositRate = await interestRateModel.getDepositRate(myToken);
      const baseRate = await interestRateModel.baseRate();
      const rateSlope1 = await interestRateModel.rateSlope1();
      const reserveFactor = await interestRateModel.reserveFactor();

      //Trigger interest accrual
      const tx =await lendingPool.accrueInterest(myToken);

      // Manually calculate expected rates

      expect(borrowRate).to.equal(baseRate + rateSlope1 * (marketBefore.totalBorrows * 1_000_000_000_000_000_000n / marketBefore.totalDeposits) / 1_000_000_000_000_000_000n);
      expect(depositRate).to.equal(borrowRate * (marketBefore.totalBorrows * 1_000_000_000_000_000_000n / marketBefore.totalDeposits) * (1_000_000_000_000_000_000n - reserveFactor) / 1_000_000_000_000_000_000n / 1_000_000_000_000_000_000n);

      const expectedTotalBorrowsIncrease = marketBefore.totalBorrows * borrowRate / 1_000_000_000_000_000_000n;
      const expectedTotalDepositsIncrease = marketBefore.totalDeposits * depositRate / 1_000_000_000_000_000_000n;
      const expectedBorrowIndexIncrease = marketBefore.borrowIndex * borrowRate / 1_000_000_000_000_000_000n;
      const expectedDepositIndexIncrease = marketBefore.depositIndex * depositRate / 1_000_000_000_000_000_000n;

      const marketAfter = await lendingPool.markets(myToken);
      expect(marketAfter.totalBorrows).to.be.closeTo(expectedTotalBorrowsIncrease + marketBefore.totalBorrows, ethers.parseUnits("0.01", 18));
      expect(marketAfter.totalDeposits).to.be.closeTo(expectedTotalDepositsIncrease + marketBefore.totalDeposits, ethers.parseUnits("0.01", 18));
      expect(marketAfter.borrowIndex).to.be.closeTo(expectedBorrowIndexIncrease + marketBefore.borrowIndex, ethers.parseUnits("0.0001", 18));
      expect(marketAfter.depositIndex).to.be.closeTo(expectedDepositIndexIncrease + marketBefore.depositIndex, ethers.parseUnits("0.0001", 18));
    });

    it("can liquidate properly", async () => {
      const [owner, addr1] = await ethers.getSigners();
      
      //Owner deposits 1000 MyToken
      await myToken.approve(lendingPool, ethers.parseUnits("1000", 18));
      await lendingPool.deposit(myToken, ethers.parseUnits("1000", 18));

      //Addr1 deposits 1000 MyToken as collateral
      await myToken.mint(addr1.address, ethers.parseUnits("1000", 18));
      await myToken.connect(addr1).approve(lendingPool, ethers.parseUnits("1000", 18));
      await lendingPool.connect(addr1).deposit(myToken, ethers.parseUnits("1000", 18));
      expect((await lendingPool.userBalances(addr1.address, myToken)).deposited).to.equal(ethers.parseUnits("1000", 18));

      //Addr1 borrows 700 MyToken
      await lendingPool.connect(addr1).borrow(myToken, ethers.parseUnits("700", 18));

      //set liquidation threshold low to allow liquidation
      await liquidation.setLiquidateParams(ethers.parseUnits("0.5", 18), ethers.parseUnits("0.5", 18), ethers.parseUnits("0.05", 18));

      //Attempt liquidation
      await myToken.connect(owner).approve(liquidation, ethers.parseUnits("350", 18));
      const tx = await liquidation.connect(owner).liquidate(addr1, owner, myToken, myToken, ethers.parseUnits("350", 18));
      expect(tx).to.emit(liquidation, "Liquidation").withArgs(owner.address, addr1.address, myToken,myToken, ethers.parseUnits("350", 18), ethers.parseUnits("367.5", 18));

      //Check balances after liquidation
      const addr1Balances = await lendingPool.userBalances(addr1.address, myToken);
      expect(addr1Balances.borrowed).to.be.closeTo(ethers.parseUnits("350", 18), ethers.parseUnits("0.001", 18));
      expect(addr1Balances.deposited).to.be.closeTo(ethers.parseUnits("632.5", 18), ethers.parseUnits("0.001", 18));
      const ownerBalances = await myToken.balanceOf(owner.address);
      expect(ownerBalances).to.be.closeTo(ethers.parseUnits("999017.5", 18), ethers.parseUnits("0.001", 18));
    });
});