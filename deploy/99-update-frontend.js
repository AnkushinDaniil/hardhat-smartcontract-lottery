const { ethers, network } = require("hardhat")
const fs = require("fs")

const FRONT_END_ADDRESSES_FILE =
    "../nextjs-smartcontract-lottery/constants/contractAddresses.json"
const FRONT_END_ABI_FILE = "../nextjs-smartcontract-lottery/constants/abi.json"

module.exports = async () => {
    if (process.env.UPDATE_FRONT_END) {
        updateContractAdresses()
        updateContractAbi()
    }
}

async function updateContractAdresses() {
    const lottery = await ethers.getContract("Lottery")
    const chainId = network.config.chainId.toString()
    const lotteryAddress = await lottery.getAddress()
    const contractAddresses = JSON.parse(
        fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8"),
    )
    if (chainId in contractAddresses) {
        if (!contractAddresses[chainId].includes(lotteryAddress)) {
            contractAddresses[chainId].push(lotteryAddress)
        }
    } else {
        contractAddresses[chainId] = lotteryAddress
    }
    fs.writeFileSync(
        FRONT_END_ADDRESSES_FILE,
        JSON.stringify(contractAddresses),
    )
}

async function updateContractAbi() {
    const lottery = await ethers.getContract("Lottery")
    fs.writeFileSync(FRONT_END_ABI_FILE, lottery.interface.formatJson())
}

module.exports.tags = ["all", "frontend"]
