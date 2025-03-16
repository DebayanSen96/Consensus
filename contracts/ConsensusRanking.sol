// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ConsensusRanking is Ownable, ReentrancyGuard {
    // Precision for fixed-point calculations
    uint256 constant PRECISION = 1e18;
    
    struct Farm {
        uint256 id;
        address owner;
        uint256 consensusScore;  // Weighted average of verified scores
        uint256 rank;
        uint256 lastUpdateTime;
        uint256 verifierCount;
    }
    
    struct Verifier {
        address addr;
        uint256 stake;
        uint256 accuracyScore;   // How close to consensus (scaled by PRECISION)
        uint256 avgResponseTime; // In seconds
        uint256 successfulVerifications;
        uint256 rank;
    }
    
    struct VerificationSubmission {
        uint256 farmId;
        uint256 sharpeRatio;
        uint256 sortinoRatio;
        uint256 maxDrawdown;
        uint256 timestamp;
    }
    
    // State variables
    mapping(uint256 => Farm) public farms;
    mapping(address => Verifier) public verifiers;
    mapping(uint256 => address[]) public farmVerifiers;  // Farm ID => Assigned verifiers
    mapping(uint256 => mapping(address => VerificationSubmission)) public submissions;
    
    uint256 public constant MAX_FARMS = 20;
    uint256 public constant VERIFIERS_PER_FARM = 3;
    uint256 public farmCount;
    
    // Events
    event FarmScoreUpdated(uint256 indexed farmId, uint256 newScore);
    event VerifierAssigned(uint256 indexed farmId, address indexed verifier);
    event VerificationSubmitted(uint256 indexed farmId, address indexed verifier, uint256 score);
    
    // Weights for performance metrics
    struct MetricWeights {
        uint256 sharpeWeight;    // 40%
        uint256 sortinoWeight;   // 30%
        uint256 mddWeight;       // 30%
    }
    
    MetricWeights public weights = MetricWeights(4000, 3000, 3000);
    
    constructor() {
        farmCount = 0;
    }
    
    function registerFarm(address owner) external onlyOwner {
        require(farmCount < MAX_FARMS, "Maximum farms reached");
        uint256 farmId = farmCount + 1;
        
        farms[farmId] = Farm({
            id: farmId,
            owner: owner,
            consensusScore: 0,
            rank: 0,
            lastUpdateTime: block.timestamp,
            verifierCount: 0
        });
        
        farmCount++;
    }
    
    function assignVerifiers(uint256 farmId, address[] calldata verifierAddresses) 
        external 
        onlyOwner 
    {
        require(farms[farmId].id != 0, "Farm does not exist");
        require(verifierAddresses.length == VERIFIERS_PER_FARM, "Invalid verifier count");
        
        // Clear previous assignments
        delete farmVerifiers[farmId];
        
        // Assign new verifiers
        for(uint256 i = 0; i < verifierAddresses.length; i++) {
            farmVerifiers[farmId].push(verifierAddresses[i]);
            emit VerifierAssigned(farmId, verifierAddresses[i]);
        }
        
        farms[farmId].verifierCount = VERIFIERS_PER_FARM;
    }
    
    function submitVerification(
        uint256 farmId,
        uint256 sharpeRatio,
        uint256 sortinoRatio,
        uint256 maxDrawdown
    ) 
        external 
        nonReentrant 
    {
        require(isAssignedVerifier(msg.sender, farmId), "Not assigned verifier");
        
        // Record submission
        submissions[farmId][msg.sender] = VerificationSubmission({
            farmId: farmId,
            sharpeRatio: sharpeRatio,
            sortinoRatio: sortinoRatio,
            maxDrawdown: maxDrawdown,
            timestamp: block.timestamp
        });
        
        // Update verifier metrics
        updateVerifierMetrics(msg.sender, farmId);
        
        // Calculate and update consensus if we have all submissions
        if(hasAllSubmissions(farmId)) {
            updateConsensusScore(farmId);
        }
    }
    
    function updateConsensusScore(uint256 farmId) internal {
        address[] memory farmVerifierList = farmVerifiers[farmId];
        uint256 totalScore = 0;
        
        for(uint256 i = 0; i < farmVerifierList.length; i++) {
            VerificationSubmission memory submission = submissions[farmId][farmVerifierList[i]];
            
            uint256 verifierScore = calculateScore(
                submission.sharpeRatio,
                submission.sortinoRatio,
                submission.maxDrawdown
            );
            
            totalScore += verifierScore;
        }
        
        uint256 consensusScore = totalScore / farmVerifierList.length;
        farms[farmId].consensusScore = consensusScore;
        
        updateFarmRankings();
        emit FarmScoreUpdated(farmId, consensusScore);
    }
    
    function calculateScore(
        uint256 sharpeRatio,
        uint256 sortinoRatio,
        uint256 maxDrawdown
    ) 
        public 
        view 
        returns (uint256) 
    {
        return (
            (sharpeRatio * weights.sharpeWeight) +
            (sortinoRatio * weights.sortinoWeight) +
            ((PRECISION - maxDrawdown) * weights.mddWeight)
        ) / 10000; // Divide by total weight basis points
    }
    
    function updateVerifierMetrics(address verifier, uint256 farmId) internal {
        Verifier storage v = verifiers[verifier];
        v.successfulVerifications++;
        
        // Update response time
        uint256 responseTime = block.timestamp - farms[farmId].lastUpdateTime;
        v.avgResponseTime = ((v.avgResponseTime * (v.successfulVerifications - 1)) + responseTime) 
                          / v.successfulVerifications;
        
        updateVerifierRankings();
    }
    
    function updateFarmRankings() internal {
        // Create temporary array for sorting
        uint256[] memory farmIds = new uint256[](farmCount);
        uint256[] memory scores = new uint256[](farmCount);
        
        // Populate arrays
        for(uint256 i = 1; i <= farmCount; i++) {
            farmIds[i-1] = i;
            scores[i-1] = farms[i].consensusScore;
        }
        
        // Sort farms by score (bubble sort for simplicity)
        for(uint256 i = 0; i < farmCount; i++) {
            for(uint256 j = 0; j < farmCount - i - 1; j++) {
                if(scores[j] < scores[j+1]) {
                    // Swap scores
                    uint256 tempScore = scores[j];
                    scores[j] = scores[j+1];
                    scores[j+1] = tempScore;
                    
                    // Swap IDs
                    uint256 tempId = farmIds[j];
                    farmIds[j] = farmIds[j+1];
                    farmIds[j+1] = tempId;
                }
            }
        }
        
        // Update ranks
        for(uint256 i = 0; i < farmCount; i++) {
            farms[farmIds[i]].rank = i + 1;
        }
    }
    
    function updateVerifierRankings() internal {
        // Implementation of verifier ranking update
        // This can be expanded based on specific requirements
    }
    
    // Helper functions
    function isAssignedVerifier(address verifier, uint256 farmId) 
        public 
        view 
        returns (bool) 
    {
        address[] memory assigned = farmVerifiers[farmId];
        for(uint256 i = 0; i < assigned.length; i++) {
            if(assigned[i] == verifier) return true;
        }
        return false;
    }
    
    function hasAllSubmissions(uint256 farmId) 
        public 
        view 
        returns (bool) 
    {
        address[] memory assigned = farmVerifiers[farmId];
        for(uint256 i = 0; i < assigned.length; i++) {
            if(submissions[farmId][assigned[i]].timestamp == 0) return false;
        }
        return true;
    }
    
    // View functions for rankings
    function getTopFarms(uint256 count) 
        external 
        view 
        returns (uint256[] memory) 
    {
        require(count <= farmCount, "Count exceeds farm count");
        uint256[] memory topFarms = new uint256[](count);
        uint256 added = 0;
        
        for(uint256 rank = 1; rank <= farmCount && added < count; rank++) {
            for(uint256 id = 1; id <= farmCount; id++) {
                if(farms[id].rank == rank) {
                    topFarms[added] = id;
                    added++;
                    break;
                }
            }
        }
        
        return topFarms;
    }
}
