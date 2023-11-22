const { ethers, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

async function mockKeepers() {
    const lottery = await ethers.getContract("Lottery")
    const checkData = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(""))
    const { upkeepNeeded } = await lottery.callStatic.checkUpkeep(checkData)
    if (upkeepNeeded) {
        const tx = await lottery.performUpkeep(checkData)
        const txReceipt = await tx.wait(1)
        const requestId = txReceipt.events[1].args.requestId
        console.log(`Performed upkeep with RequestId: ${requestId}`)
        if (developmentChains.includes(network.name)) {
            await mockVrf(requestId, lottery)
        }
    } else {
        console.log("No upkeep needed")
    }
}

async function mockVrf(requestId, raffle) {
    const vrfCoordinatorV2Mock = await ethers.getContract(
        "VRFCoordinatorV2Mock",
    )
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffle.address)
    console.log("Responded")
    const recentWinner = await raffle.getRecentWinner()
    console.log(`The winner is: ${recentWinner}`)
}

mockKeepers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
