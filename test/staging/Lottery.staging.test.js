const { network, getNamedAccounts, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery staging tests", () => {
          let lottery, lotteryEntranceFee, deployer

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              lottery = await ethers.getContract("Lottery", deployer)
              lotteryEntranceFee = await lottery.getEntranceFee()
          })
          describe("fulfillRandomWords", () => {
              it("works with live Chainlink Keepers and Chainlink VRF, take a random winer", async () => {
                  const startingTimestamp = await lottery.getLatestTimestamp()
                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired")
                          try {
                              const recentWinner =
                                  await lottery.getRecentWinner()
                              //   console.log(recentWinner)
                              const lotteryState =
                                  await lottery.getLotteryState()
                              //   console.log(lotteryState)
                              const winnerEndingBalance =
                                  await ethers.provider.getBalance(accounts[0])
                              //   console.log(winnerEndingBalance)
                              const endingTimeStamp =
                                  await lottery.getLatestTimestamp()
                              //   console.log(endingTimeStamp)

                              await expect(lottery.getPlayer(0)).to.be.reverted
                              //   console.log("reverted")
                              assert.equal(
                                  recentWinner.toString(),
                                  accounts[0].address,
                              )
                              //   console.log("1")
                              assert.equal(lotteryState, 0)
                              //   console.log("2")
                              assert.equal(
                                  winnerEndingBalance,
                                  winnerStartingBalance + lotteryEntranceFee,
                              )
                              //   console.log("3")
                              assert(endingTimeStamp > startingTimestamp)
                              //   console.log("4")
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject()
                          }
                      })
                      const tx = await lottery.enterLottery({
                          value: lotteryEntranceFee,
                      })
                      await tx.wait(1)
                      const winnerStartingBalance =
                          await ethers.provider.getBalance(accounts[0])
                      //   console.log(winnerStartingBalance)
                  })
              })
          })
      })
