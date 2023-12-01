const { network, ethers } = require("hardhat")
const {
    developmentChains,
    networkConfig,
    VRF_SUB_FUND_AMOUNT,
} = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    console.log("Getting named accounts...")
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    console.log(`Current chainId is ${chainId.toString()}`)
    let vrfCoordinatorV2Address, subId, vrfCoordinatorV2Mock

    if (developmentChains.includes(network.name)) {
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = await vrfCoordinatorV2Mock.getAddress()
        console.log(
            `vrfCoordinatorV2Address = ${vrfCoordinatorV2Address.toString()}`,
        )
        const transactionResponse =
            await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait()
        subId = transactionReceipt.logs[0].args.subId
        await vrfCoordinatorV2Mock.fundSubscription(subId, VRF_SUB_FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        console.log(
            `vrfCoordinatorV2Address = ${vrfCoordinatorV2Address.toString()}`,
        )
        subId = networkConfig[chainId]["subscriptionId"]
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subId,
        callbackGasLimit,
        interval,
    ]

    console.log("Deploying lottery contract...")

    const lottery = await deploy("Lottery", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    console.log("Lottery contract was successfully deployed")

    if (developmentChains.includes(network.name)) {
        await vrfCoordinatorV2Mock.addConsumer(subId, lottery.address)
    }

    if (
        !developmentChains.includes(network.name) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        log("Verifying the Lottery contract")
        await verify(lottery.address, args)
    }

    log("-------------------------------------")
}

module.exports.tags = ["all", "lottery"]
