// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ConsensusAlgorithm
 * @dev Implements a Proof of Returns (PoR) consensus mechanism for DeFi protocol return verification
 */
contract ConsensusAlgorithm is Ownable, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;

    // Structs
    struct Verifier {
        address addr;
        uint256 stake;
        uint256 reputation;
        bool isActive;
    }

    struct ReturnProof {
        bytes32 farmId;
        uint256 timestamp;
        uint256 returnAmount;
        bytes zkProof;
    }

    struct ConsensusRound {
        bytes32 roundId;
        bytes32 farmId;
        uint256 startTime;
        uint256 endTime;
        uint256 minVerifiers;
        mapping(address => ReturnProof) verifierProofs;
        address[] participants;
        bool isFinalized;
        uint256 consensusReturn;
    }

    // State variables
    mapping(address => Verifier) public verifiers;
    mapping(bytes32 => ConsensusRound) public consensusRounds;
    uint256 public minStakeRequired;
    uint256 public consensusThreshold;
    uint256 public roundDuration;
    uint256 public slashingPenalty;

    // Events
    event VerifierRegistered(address indexed verifier, uint256 stake);
    event VerifierSlashed(address indexed verifier, uint256 amount);
    event ProofSubmitted(bytes32 indexed roundId, address indexed verifier, uint256 returnAmount);
    event ConsensusReached(bytes32 indexed roundId, uint256 consensusReturn);
    event ConsensusRoundStarted(bytes32 indexed roundId, bytes32 indexed farmId);

    constructor(
        uint256 _minStake,
        uint256 _consensusThreshold,
        uint256 _roundDuration,
        uint256 _slashingPenalty
    ) {
        minStakeRequired = _minStake;
        consensusThreshold = _consensusThreshold;
        roundDuration = _roundDuration;
        slashingPenalty = _slashingPenalty;
    }

    // Verifier Management
    function registerVerifier() external payable {
        require(msg.value >= minStakeRequired, "Insufficient stake");
        require(!verifiers[msg.sender].isActive, "Already registered");

        verifiers[msg.sender] = Verifier({
            addr: msg.sender,
            stake: msg.value,
            reputation: 100,
            isActive: true
        });

        emit VerifierRegistered(msg.sender, msg.value);
    }

    // Consensus Round Management
    function startConsensusRound(bytes32 _farmId, uint256 _minVerifiers) external onlyOwner {
        bytes32 roundId = keccak256(abi.encodePacked(_farmId, block.timestamp));
        
        ConsensusRound storage round = consensusRounds[roundId];
        round.roundId = roundId;
        round.farmId = _farmId;
        round.startTime = block.timestamp;
        round.endTime = block.timestamp + roundDuration;
        round.minVerifiers = _minVerifiers;
        round.isFinalized = false;

        emit ConsensusRoundStarted(roundId, _farmId);
    }

    // Proof Submission
    function submitProof(
        bytes32 _roundId,
        uint256 _returnAmount,
        bytes calldata _zkProof
    ) external nonReentrant whenNotPaused {
        require(verifiers[msg.sender].isActive, "Not an active verifier");
        ConsensusRound storage round = consensusRounds[_roundId];
        require(block.timestamp <= round.endTime, "Round ended");
        require(!round.isFinalized, "Round finalized");

        ReturnProof memory proof = ReturnProof({
            farmId: round.farmId,
            timestamp: block.timestamp,
            returnAmount: _returnAmount,
            zkProof: _zkProof
        });

        round.verifierProofs[msg.sender] = proof;
        round.participants.push(msg.sender);

        emit ProofSubmitted(_roundId, msg.sender, _returnAmount);

        if (round.participants.length >= round.minVerifiers) {
            _tryFinalizeRound(_roundId);
        }
    }

    // Internal consensus mechanism
    function _tryFinalizeRound(bytes32 _roundId) internal {
        ConsensusRound storage round = consensusRounds[_roundId];
        if (round.participants.length < round.minVerifiers) return;

        uint256[] memory returnValues = new uint256[](round.participants.length);
        for (uint256 i = 0; i < round.participants.length; i++) {
            returnValues[i] = round.verifierProofs[round.participants[i]].returnAmount;
        }

        uint256 consensusReturn = _calculateMedian(returnValues);
        round.consensusReturn = consensusReturn;
        round.isFinalized = true;

        _handleSlashing(_roundId, consensusReturn);
        emit ConsensusReached(_roundId, consensusReturn);
    }

    // Utility functions
    function _calculateMedian(uint256[] memory _returns) internal pure returns (uint256) {
        // Sort returns
        for (uint256 i = 0; i < _returns.length; i++) {
            for (uint256 j = i + 1; j < _returns.length; j++) {
                if (_returns[i] > _returns[j]) {
                    uint256 temp = _returns[i];
                    _returns[i] = _returns[j];
                    _returns[j] = temp;
                }
            }
        }
        
        // Return median
        if (_returns.length % 2 == 0) {
            uint256 mid1 = _returns[_returns.length / 2 - 1];
            uint256 mid2 = _returns[_returns.length / 2];
            return (mid1 + mid2) / 2;
        } else {
            return _returns[_returns.length / 2];
        }
    }

    function _handleSlashing(bytes32 _roundId, uint256 _consensusReturn) internal {
        ConsensusRound storage round = consensusRounds[_roundId];
        
        for (uint256 i = 0; i < round.participants.length; i++) {
            address verifier = round.participants[i];
            uint256 submittedReturn = round.verifierProofs[verifier].returnAmount;
            
            // Slash if deviation is too high
            if (abs(submittedReturn, _consensusReturn) > consensusThreshold) {
                uint256 slashAmount = (verifiers[verifier].stake * slashingPenalty) / 100;
                verifiers[verifier].stake -= slashAmount;
                verifiers[verifier].reputation -= 10;
                
                emit VerifierSlashed(verifier, slashAmount);
            }
        }
    }

    function abs(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a - b : b - a;
    }

    // View functions
    function getVerifier(address _verifier) external view returns (Verifier memory) {
        return verifiers[_verifier];
    }

    function getRoundStatus(bytes32 _roundId) external view returns (uint256, bool) {
        ConsensusRound storage round = consensusRounds[_roundId];
        return (round.consensusReturn, round.isFinalized);
    }

    function getRoundParticipants(bytes32 _roundId) external view returns (address[] memory) {
        return consensusRounds[_roundId].participants;
    }

    // Admin functions
    function updateConsensusParameters(
        uint256 _minStake,
        uint256 _consensusThreshold,
        uint256 _roundDuration,
        uint256 _slashingPenalty
    ) external onlyOwner {
        minStakeRequired = _minStake;
        consensusThreshold = _consensusThreshold;
        roundDuration = _roundDuration;
        slashingPenalty = _slashingPenalty;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
