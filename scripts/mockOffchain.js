const { ethers, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

async function mockKeepers() {
    const lottery = await ethers.getContract("Lottery")
    const checkData = ethers.keccak256(ethers.toUtf8Bytes(""))
    const { _upkeepNeeded: upkeepNeeded } =
        await lottery.checkUpkeep.staticCall(checkData)
    console.log(
        `Lottery state is ${(await lottery.getLotteryState()).toString()}`,
    )
    console.log(
        `Latest timestamp is ${(
            await lottery.getLatestTimestamp()
        ).toString()}`,
    )
    console.log(
        `Current number of players is ${(
            await lottery.getNumberOfPlayers()
        ).toString()}`,
    )
    console.log(`upkeepNeeded = ${upkeepNeeded.toString()}`)
    if (upkeepNeeded) {
        const tx = await lottery.performUpkeep(checkData)
        const txReceipt = await tx.wait(1)
        const requestId = txReceipt.logs[1].args.requestId
        console.log(`Performed upkeep with RequestId: ${requestId}`)
        if (developmentChains.includes(network.name)) {
            await mockVrf(requestId, lottery)
        }
    } else {
        console.log("No upkeep needed")
    }
}

async function mockVrf(requestId, lottery) {
    const vrfCoordinatorV2Mock = await ethers.getContract(
        "VRFCoordinatorV2Mock",
    )

    const lotteryAddress = await lottery.getAddress()
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, lotteryAddress)
    console.log("Responded")
    const recentWinner = await lottery.getRecentWinner()
    console.log(`The winner is: ${recentWinner}`)
}

mockKeepers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
