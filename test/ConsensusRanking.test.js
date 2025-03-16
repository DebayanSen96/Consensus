const { expect } = require("chai");
const { ethers } = require("hardhat");

async function setupSigners(count) {
    const signers = await ethers.getSigners();
    if (signers.length < count) {
        throw new Error(`Not enough signers. Need ${count}, but only have ${signers.length}`);
    }
    return signers;
}

describe("ConsensusRanking", function () {
    let consensusRanking;
    let owner;
    let signers;
    let farmOwners;
    let verifiers;
    
    beforeEach(async function () {
        // We need at least 81 signers (1 owner + 20 farms + 60 verifiers)
        signers = await setupSigners(81);
        owner = signers[0];
        
        // Get farm owners and verifiers from signers
        farmOwners = signers.slice(1, 21); // 20 farm owners
        verifiers = signers.slice(21, 81); // 60 verifiers
        
        // Deploy contract
        const ConsensusRanking = await ethers.getContractFactory("ConsensusRanking");
        consensusRanking = await ConsensusRanking.deploy();
        
        // Setup 20 farms
        for(let i = 0; i < farmOwners.length; i++) {
            await consensusRanking.registerFarm(await farmOwners[i].getAddress());
        }
    });
    
    describe("Farm Registration", function () {
        it("Should register farms correctly", async function () {
            const farmId = 1;
            const farm = await consensusRanking.farms(farmId);
            expect(farm.id).to.equal(farmId);
            expect(farm.owner).to.equal(await farmOwners[0].getAddress());
        });

        it("Should not allow more than MAX_FARMS", async function () {
            await expect(
                consensusRanking.registerFarm(await signers[81].getAddress())
            ).to.be.revertedWith("Maximum farms reached");
        });
    });

    describe("Verifier Assignment", function () {
        it("Should assign verifiers correctly", async function () {
            const farmId = 1;
            const selectedVerifiers = await Promise.all(
                verifiers.slice(0, 3).map(v => v.getAddress())
            );
            
            // Ensure we have exactly 3 verifiers as required by the contract
            expect(selectedVerifiers.length).to.equal(3);
            
            await consensusRanking.assignVerifiers(farmId, selectedVerifiers);
            
            // Check assignments
            for(let verifier of selectedVerifiers) {
                expect(await consensusRanking.isAssignedVerifier(verifier, farmId)).to.be.true;
            }
        });

        it("Should reject invalid verifier count", async function () {
            const farmId = 1;
            const invalidVerifiers = await Promise.all(
                verifiers.slice(0, 2).map(v => v.getAddress())
            );
            
            await expect(
                consensusRanking.assignVerifiers(farmId, invalidVerifiers)
            ).to.be.revertedWith("Invalid verifier count");
        });
    });

    describe("Verification Submission", function () {
        let farmId;
        let selectedVerifiers;

        beforeEach(async function () {
            farmId = 1;
            selectedVerifiers = verifiers.slice(0, 3);
            const verifierAddresses = await Promise.all(
                selectedVerifiers.map(v => v.getAddress())
            );
            await consensusRanking.assignVerifiers(farmId, verifierAddresses);
        });

        it("Should accept valid verification submission", async function () {
            const metrics = {
                sharpe: ethers.parseUnits("0.8", 18),
                sortino: ethers.parseUnits("0.7", 18),
                mdd: ethers.parseUnits("0.2", 18)
            };

            await expect(
                consensusRanking.connect(verifiers[0]).submitVerification(
                    farmId,
                    metrics.sharpe,
                    metrics.sortino,
                    metrics.mdd
                )
            ).to.not.be.reverted;
        });

        it("Should reject submission from non-assigned verifier", async function () {
            const nonAssignedVerifier = verifiers[10];
            const metrics = {
                sharpe: ethers.parseUnits("0.8", 18),
                sortino: ethers.parseUnits("0.7", 18),
                mdd: ethers.parseUnits("0.2", 18)
            };

            await expect(
                consensusRanking.connect(nonAssignedVerifier).submitVerification(
                    farmId,
                    metrics.sharpe,
                    metrics.sortino,
                    metrics.mdd
                )
            ).to.be.revertedWith("Not assigned verifier");
        });

        it("Should calculate consensus score after all submissions", async function () {
            const testMetrics = [
                { sharpe: ethers.parseUnits("0.8", 18), sortino: ethers.parseUnits("0.7", 18), mdd: ethers.parseUnits("0.2", 18) },
                { sharpe: ethers.parseUnits("0.85", 18), sortino: ethers.parseUnits("0.75", 18), mdd: ethers.parseUnits("0.18", 18) },
                { sharpe: ethers.parseUnits("0.82", 18), sortino: ethers.parseUnits("0.72", 18), mdd: ethers.parseUnits("0.19", 18) }
            ];
            
            // Submit all verifications
            for(let i = 0; i < selectedVerifiers.length; i++) {
                await consensusRanking.connect(selectedVerifiers[i]).submitVerification(
                    farmId,
                    testMetrics[i].sharpe,
                    testMetrics[i].sortino,
                    testMetrics[i].mdd
                );
            }
            
            const farm = await consensusRanking.farms(farmId);
            expect(farm.consensusScore).to.be.gt(0);
        });
    });

    describe("Rankings", function () {
        it("Should return correct top farms", async function () {
            // Setup multiple farms with different scores
            const farmId = 1;
            const selectedVerifiers = await Promise.all(
                verifiers.slice(0, 3).map(v => v.getAddress())
            );
            
            // Ensure we have exactly 3 verifiers as required by the contract
            expect(selectedVerifiers.length).to.equal(3);
            await consensusRanking.assignVerifiers(farmId, selectedVerifiers);

            const metrics = {
                sharpe: ethers.parseUnits("0.9", 18),
                sortino: ethers.parseUnits("0.8", 18),
                mdd: ethers.parseUnits("0.1", 18)
            };

            // Submit verifications
            // Submit verifications from each verifier
            const verifierSlice = verifiers.slice(0, 3); // Get first 3 verifiers
            for(const verifier of verifierSlice) {
                await consensusRanking.connect(verifier).submitVerification(
                    farmId,
                    metrics.sharpe,
                    metrics.sortino,
                    metrics.mdd
                );
            }

            const topFarms = await consensusRanking.getTopFarms(1);
            expect(topFarms[0]).to.equal(farmId);
        });
    });
});
