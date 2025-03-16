const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Consensus Algorithm", function () {
  let consensusAlgorithm;
  let owner;
  let verifier1;
  let verifier2;
  let verifier3;

  // Test parameters
  const minStake = ethers.parseEther("100");  // 100 tokens
  const consensusThreshold = 500;  // 5% deviation allowed
  const roundDuration = 3600;  // 1 hour
  const slashingPenalty = 10;  // 10% penalty

  beforeEach(async function () {
    // Get signers
    [owner, verifier1, verifier2, verifier3] = await ethers.getSigners();

    // Deploy ConsensusAlgorithm
    const ConsensusAlgorithm = await ethers.getContractFactory("ConsensusAlgorithm");
    consensusAlgorithm = await ConsensusAlgorithm.deploy(
      minStake,  
      consensusThreshold,
      roundDuration,
      slashingPenalty
    );
    await consensusAlgorithm.waitForDeployment();
  });

  it("Should complete a full consensus cycle", async function () {
    // 1. Register verifiers
    for (const verifier of [verifier1, verifier2, verifier3]) {
      await consensusAlgorithm.connect(verifier).registerVerifier({ value: minStake });
      const verifierInfo = await consensusAlgorithm.getVerifier(await verifier.getAddress());
      expect(verifierInfo.isActive).to.be.true;
    }

    // 2. Start consensus round
    const farmId = ethers.keccak256(ethers.toUtf8Bytes("FARM_1"));
    const tx = await consensusAlgorithm.connect(owner).startConsensusRound(farmId, 3);
    const receipt = await tx.wait();
    
    // Get roundId from the ConsensusRoundStarted event
    const roundId = receipt.logs[0].topics[1];

    // Mock ZK proof
    const mockZkProof = ethers.randomBytes(32);

    // Submit slightly different returns to test consensus
    const baseReturn = ethers.parseEther("100");
    await consensusAlgorithm.connect(verifier1).submitProof(roundId, baseReturn, mockZkProof);
    await consensusAlgorithm.connect(verifier2).submitProof(roundId, baseReturn + ethers.parseEther("1"), mockZkProof);
    await consensusAlgorithm.connect(verifier3).submitProof(roundId, baseReturn + ethers.parseEther("2"), mockZkProof);

    // 4. Verify consensus
    const [consensusReturn, isFinalized] = await consensusAlgorithm.getRoundStatus(roundId);
    expect(isFinalized).to.be.true;
    
    // The consensus should be the median value (101 ETH)
    expect(consensusReturn).to.equal(baseReturn + ethers.parseEther("1"));
  });

});

