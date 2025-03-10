// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ConsensusAlgorithm.sol";

/**
 * @title DXPInit
 * @dev Core protocol contract managing DXP token and protocol initialization
 */
contract DXPInit is ERC20, Ownable, ReentrancyGuard {
    ConsensusAlgorithm public consensusAlgorithm;
    
    // Protocol parameters
    uint256 public constant INITIAL_SUPPLY = 1000000 * 10**18; // 1M tokens
    uint256 public rewardRate;
    uint256 public epochDuration;
    uint256 public lastEpochTime;

    // Farm registry
    mapping(bytes32 => address) public registeredFarms;
    mapping(bytes32 => bool) public activeFarms;

    // Events
    event FarmRegistered(bytes32 indexed farmId, address farmAddress);
    event RewardsDistributed(bytes32 indexed farmId, uint256 amount);
    event ConsensusAlgorithmUpdated(address newAddress);

    constructor(
        uint256 _rewardRate,
        uint256 _epochDuration,
        address _consensusAlgorithm
    ) ERC20("Dexponent Protocol Token", "DXP") {
        rewardRate = _rewardRate;
        epochDuration = _epochDuration;
        lastEpochTime = block.timestamp;
        consensusAlgorithm = ConsensusAlgorithm(_consensusAlgorithm);
        
        // Mint initial supply to contract
        _mint(address(this), INITIAL_SUPPLY);
    }

    // Farm Management
    function registerFarm(bytes32 _farmId, address _farmAddress) external onlyOwner {
        require(_farmAddress != address(0), "Invalid farm address");
        require(registeredFarms[_farmId] == address(0), "Farm already registered");

        registeredFarms[_farmId] = _farmAddress;
        activeFarms[_farmId] = true;

        emit FarmRegistered(_farmId, _farmAddress);
    }

    // Reward Distribution
    function distributeRewards(
        bytes32 _farmId,
        bytes32 _consensusRoundId
    ) external nonReentrant {
        require(activeFarms[_farmId], "Farm not active");
        
        // Get consensus data
        (uint256 consensusReturn, bool isFinalized) = getConsensusData(_consensusRoundId);
        require(isFinalized, "Consensus not reached");

        // Calculate rewards based on verified returns
        uint256 rewards = calculateRewards(consensusReturn);
        
        // Transfer rewards to farm
        require(transfer(registeredFarms[_farmId], rewards), "Reward transfer failed");
        
        emit RewardsDistributed(_farmId, rewards);
    }

    // Internal functions
    function calculateRewards(uint256 _verifiedReturn) internal view returns (uint256) {
        // Basic reward calculation based on verified returns and reward rate
        return (_verifiedReturn * rewardRate) / 10000;
    }

    function getConsensusData(bytes32 _roundId) internal view returns (uint256, bool) {
        (uint256 consensusReturn, bool isFinalized) = consensusAlgorithm.getRoundStatus(_roundId);
        return (consensusReturn, isFinalized);
    }

    // Admin functions
    function updateConsensusAlgorithm(address _newConsensusAlgorithm) external onlyOwner {
        require(_newConsensusAlgorithm != address(0), "Invalid address");
        consensusAlgorithm = ConsensusAlgorithm(_newConsensusAlgorithm);
        emit ConsensusAlgorithmUpdated(_newConsensusAlgorithm);
    }

    function updateProtocolParameters(
        uint256 _newRewardRate,
        uint256 _newEpochDuration
    ) external onlyOwner {
        rewardRate = _newRewardRate;
        epochDuration = _newEpochDuration;
    }

    function toggleFarm(bytes32 _farmId) external onlyOwner {
        require(registeredFarms[_farmId] != address(0), "Farm not registered");
        activeFarms[_farmId] = !activeFarms[_farmId];
    }
}
