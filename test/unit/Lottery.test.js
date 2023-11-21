const { network, getNamedAccounts, ethers } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
const { decodeBytes32String, zeroPadBytes, EtherSymbol } = require("ethers")
const {
    Bytecode,
} = require("hardhat/internal/hardhat-network/stack-traces/model")
const { boolean } = require("hardhat/internal/core/params/argumentTypes")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery unit tests", () => {
          let lottery,
              vrfCoordinatorV2Mock,
              lotteryEntranceFee,
              deployer,
              interval
          const chainId = network.config.chainId
          const VRF_SUB_FUND_AMOUNT = ethers.parseEther("2")

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              lottery = await ethers.getContract("Lottery", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  deployer,
              )
              lotteryEntranceFee = await lottery.getEntranceFee()
              interval = await lottery.getInterval()
          })

          describe("constructor", async () => {
              it("initializes the lottery state correctly", async () => {
                  const lotteryState = await lottery.getLotteryState()
                  assert.equal(lotteryState.toString(), "0")
              })
              it("initializes the lottery interval correctly", async () => {
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId].interval,
                  )
              })
              it("initializes the entrance fee correctly", async () => {
                  assert.equal(
                      lotteryEntranceFee.toString(),
                      networkConfig[chainId].entranceFee,
                  )
              })
              it("initializes the gas lane correctly", async () => {
                  const gasLane = await lottery.getGasLane()
                  assert.equal(
                      gasLane.toString(),
                      networkConfig[chainId]["gasLane"],
                  )
              })
              it("initializes the callback gas limit correctly", async () => {
                  const callbackGasLimit = await lottery.getCallbackGasLimit()
                  assert.equal(
                      callbackGasLimit.toString(),
                      networkConfig[chainId]["callbackGasLimit"],
                  )
              })
          })
          describe("enterLottery", () => {
              it("reverses if not enough money is sent", async () => {
                  await expect(
                      lottery.enterLottery(),
                  ).to.be.revertedWithCustomError(
                      lottery,
                      "Lottery__NotEnoughEthToEnter",
                  )
              })
              it("records players when they entered", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  const player = await lottery.getPlayer(0)
                  assert.equal(player, deployer)
              })
              it("emits the event on enter", async () => {
                  await expect(
                      lottery.enterLottery({ value: lotteryEntranceFee }),
                  ).to.emit(lottery, "LotteryEnter")
              })
              it("doesn't allow entry during lottery in calculating state.", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep("0x")
                  await expect(
                      lottery.enterLottery({ value: lotteryEntranceFee }),
                  ).to.be.revertedWithCustomError(lottery, "Lottery__NotOpen")
              })
          })
          describe("checkUpkeep", () => {
              it("returns false if senders haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const { _upkeepNeeded } =
                      await lottery.checkUpkeep.staticCall("0x")
                  assert.equal(_upkeepNeeded, false)
              })
              it("returns false if lottery in calculating state", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep("0x")
                  const lotteryState = await lottery.getLotteryState()
                  const { _upkeepNeeded } =
                      await lottery.checkUpkeep.staticCall("0x")
                  assert.equal(lotteryState.toString(), "1")
                  assert.equal(_upkeepNeeded, false)
              })
              it("returns false if not enough time has passed", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) - 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep("0x")
                  const { _upkeepNeeded } =
                      await lottery.checkUpkeep.staticCall("0x")
                  assert.equal(_upkeepNeeded, false)
              })
              it("returns true if  enough time has passed, lottery is open and senders sent ehough ETH", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const { _upkeepNeeded } =
                      await lottery.checkUpkeep.staticCall("0x")
                  assert.equal(_upkeepNeeded, true)
              })
          })
          describe("performUpkeep", () => {
              it("can only run if checkUpkeep is true", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const tx = await lottery.performUpkeep("0x")
                  assert(tx)
              })
              it("reverts if checkUpkeep is false", async () => {
                  await expect(
                      lottery.performUpkeep("0x"),
                  ).to.be.revertedWithCustomError(
                      lottery,
                      "Lottery__UpkeepNotNeeded",
                  )
              })
              it("updates the lottery state", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep("0x")
                  const lotteryState = await lottery.getLotteryState()
                  assert.equal(lotteryState.toString(), "1")
              })
              it("emits an event and calls the vrf coordinator", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await lottery.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.logs[1].args.requestId
                  assert(Number(requestId) > 0)
              })
          })
          describe("fulfillRandomWords", () => {
              beforeEach(async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      Number(interval) + 1,
                  ])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpkeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(
                          0,
                          lottery.target,
                      ),
                  ).to.be.revertedWith("")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(
                          1,
                          lottery.target,
                      ),
                  ).to.be.revertedWith("")
              })
              it("picks a winner, resets the lottery and sends money", async () => {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnecterLottery = lottery.connect(
                          accounts[i],
                      )
                      await accountConnecterLottery.enterLottery({
                          value: lotteryEntranceFee,
                      })
                  }
                  const startingTimestamp = await lottery.getLatestTimestamp()
                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", () => {
                          try {
                          } catch (error) {
                              reject(error)
                          }
                          resolve()
                      })
                      const tx = await lottery.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.logs[1].args.requestId,
                          lottery.target,
                      )
                  })
              })
          })
      })
