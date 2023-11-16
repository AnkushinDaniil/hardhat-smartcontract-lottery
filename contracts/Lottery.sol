// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/automation/interfaces/KeeperCompatibleInterface.sol";

// Errors
error Lottery__NotEnoughEthToEnter();
error Lottery__TransferFailed();
error Lottery__NotOpen();
error Lottery__UpkeepNotNeeded(
    uint currentBalance,
    uint numPlayers,
    uint lotteryState
);

/**
 * @title The Lottery contract
 * @author Daniil Ankushin
 * @notice The Lottery contract is a smart contract to conduct a lottery
 * @dev This implements Chainlink VRF v2 and Chainlink Keepers
 */
contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
    //  Type declarations
    enum LotteryState {
        OPEN,
        CALCULATING
    }

    // State variables
    uint private immutable i_entranceFee;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subsctiptionId;
    address payable[] private s_players;
    uint32 private immutable i_callbackGasLimit;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint16 private constant NUM_WORDS = 1;

    address private s_recentWinner;
    LotteryState private s_lotteryState;
    uint private s_lastTimestamp;
    uint private immutable i_interval;

    // Events
    event LotteryEnter(address indexed player);
    event RequestedLotteryWinner(uint indexed requestId);
    event WinnerPicked(address indexed winner);

    // Functions
    constructor(
        address _vrfCoordinatorV2,
        uint _entranceFee,
        bytes32 _gasLane,
        uint64 _subsctiptionId,
        uint32 _callbackGasLimit,
        uint _interval
    ) VRFConsumerBaseV2(_vrfCoordinatorV2) {
        i_entranceFee = _entranceFee;
        i_gasLane = _gasLane;
        i_vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinatorV2);
        i_subsctiptionId = _subsctiptionId;
        i_callbackGasLimit = _callbackGasLimit;
        s_lotteryState = LotteryState.OPEN;
        s_lastTimestamp = block.timestamp;
        i_interval = _interval;
    }

    /**
     * @notice The enterLottery function adds players to the list
     * of participants in the lottery.
     */
    function enterLottery() public payable {
        if (msg.value < i_entranceFee) {
            revert Lottery__NotEnoughEthToEnter();
        }
        if (s_lotteryState != LotteryState.OPEN) {
            revert Lottery__NotOpen();
        }
        s_players.push(payable(msg.sender));
        emit LotteryEnter(msg.sender);
    }

    /**
     * @dev The checkUpkeep function is called once `checkUpkeep` returns true,
     * and triggers a VRF Chainlink call to produce a random winner.
     * This list should be true to return true:
     * 1. The time period should have elapsed.
     * 2. The contract must include at least one Player
     * 3. The subscription is funded with LINK.
     * 4. The Lottery should be in an "open" state.
     */
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        public
        override
        returns (bool _upkeepNeeded, bytes memory /* performData */)
    {
        bool _isOpen = LotteryState.OPEN == s_lotteryState;
        bool _timePassed = ((block.timestamp - s_lastTimestamp) > i_interval);
        bool _hasPlayers = (s_players.length > 0);
        bool _hasBalance = address(this).balance > 0;
        _upkeepNeeded = (_isOpen && _timePassed && _hasPlayers && _hasBalance);
    }

    /**
     *
     * @notice The performUpkeep function verifies necessary requirements,
     * updates the state of the lottery, and requests the winner of the lottery.
     */
    function performUpkeep(bytes calldata /* performData */) external override {
        (bool upkeepNeeded, ) = this.checkUpkeep("");
        if (!upkeepNeeded) {
            revert Lottery__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint(s_lotteryState)
            );
        }
        s_lotteryState = LotteryState.CALCULATING;
        uint requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subsctiptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedLotteryWinner(requestId);
    }

    /**
     *
     * @dev The performUpkeep function verifies necessary requirements,
     * updates the state of the lottery, and requests the winner of the lottery.
     * @param _randomWords is the array with length of 1 with a random number.
     */
    function fulfillRandomWords(
        uint /*_requestId*/,
        uint[] memory _randomWords
    ) internal override {
        address payable recentWinner = s_players[
            _randomWords[0] % s_players.length
        ];
        s_recentWinner = recentWinner;
        s_players = new address payable[](0);
        s_lotteryState = LotteryState.OPEN;
        s_lastTimestamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Lottery__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    function getEntranceFee() public view returns (uint) {
        return i_entranceFee;
    }

    function getPlayer(uint _playerIndex) public view returns (address) {
        return s_players[_playerIndex];
    }

    function getRecentWinnet() public view returns (address) {
        return s_recentWinner;
    }

    function getLotteryState() public view returns (LotteryState) {
        return s_lotteryState;
    }

    function getNumWords() public pure returns (uint) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint) {
        return s_players.length;
    }

    function getLatestTimestamp() public view returns (uint) {
        return s_lastTimestamp;
    }

    function getRequestConfirmations() public pure returns (uint) {
        return REQUEST_CONFIRMATIONS;
    }
}
