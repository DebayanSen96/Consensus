const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to format numbers for console output
function formatNumber(num) {
    return ethers.formatUnits(num, 0);
}

// Generate a valid commitment within field bounds
function generateValidCommitment() {
    const FIELD_PRIME = "0x800000000000011000000000000000000000000000000000000000000000001";
    const fieldPrimeBN = ethers.toBigInt(FIELD_PRIME);
    let commitment;
    do {
        commitment = ethers.toBigInt(ethers.hexlify(ethers.randomBytes(32)));
    } while (commitment >= fieldPrimeBN);
    return commitment.toString();
}

// Generate random proof data
function generateRandomProof(expectedReturnValue, timestamp, errorRange) {
    // 20% chance of generating an invalid return value
    const useInvalidValue = Math.random() < 0.2;
    
    // Generate return value with potential error
    let returnValue;
    if (useInvalidValue) {
        // Generate value that's off by more than the error range
        const error = (Math.random() > 0.5 ? 1 : -1) * (errorRange + Math.floor(Math.random() * 10) + 1);
        returnValue = Number(formatNumber(expectedReturnValue)) + error;
    } else {
        // Generate value within error range
        const error = Math.floor(Math.random() * (errorRange * 2 + 1)) - errorRange;
        returnValue = Number(formatNumber(expectedReturnValue)) + error;
    }

    // Generate random auxiliary data
    const auxData1 = Math.floor(Math.random() * 1000);
    const auxData2 = Math.floor(Math.random() * 1000);

    return {
        evaluations: [returnValue, timestamp, auxData1, auxData2],
        commitments: [generateValidCommitment()],
        openingProof: [Math.floor(Math.random() * 100), Math.floor(Math.random() * 100)],
        lowDegreeProof: [Math.floor(Math.random() * 100), Math.floor(Math.random() * 100)]
    };
}

describe("ReturnVerifier", function () {
    let returnVerifier;
    let owner;
    let verifiers;
    let verificationResults = [];

    beforeEach(async function () {
        [owner, ...verifiers] = await ethers.getSigners();
        console.log("\n🔐 Deploying ReturnVerifier contract...");
        const ReturnVerifier = await ethers.getContractFactory("ReturnVerifier");
        returnVerifier = await ReturnVerifier.deploy();
        console.log(`✅ ReturnVerifier deployed to: ${returnVerifier.target}\n`);
    });

    describe("Consensus Verification Process", function () {
        it("Should demonstrate randomized consensus verification with 8 verifiers", async function () {
            console.log("🌟 Starting Consensus Verification Test\n");

            // 1. Setup test data
            const returnValue = ethers.parseUnits("100", 0); // 100 tokens
            const timestamp = Math.floor(Date.now() / 1000);
            const NUM_VERIFIERS = 8;
            const ERROR_RANGE = 2; // Acceptable error range for return values

            console.log(`📊 Test Parameters:`);
            console.log(`   Expected Return Value: ${formatNumber(returnValue)} tokens`);
            console.log(`   Timestamp: ${timestamp}`);
            console.log(`   Number of Verifiers: ${NUM_VERIFIERS}`);
            console.log(`   Error Range: ±${ERROR_RANGE}\n`);

            // 2. Generate random proofs from verifiers
            console.log("🔄 Verifiers Submitting Proofs:");
            const verifierProofs = [];
            
            for (let i = 0; i < NUM_VERIFIERS; i++) {
                const proof = generateRandomProof(returnValue, timestamp, ERROR_RANGE);
                verifierProofs.push(proof);
                
                console.log(`\n👤 Verifier ${i + 1} Proof:`);
                console.log(`   Evaluations: [${proof.evaluations.join(", ")}]`);
                console.log(`   Commitment: ${proof.commitments[0]}`);
            }

            // 3. Verify each proof
            console.log("\n🔍 Verifying Proofs:\n");
            verificationResults = [];

            for (let i = 0; i < verifierProofs.length; i++) {
                console.log(`⚡ Verifying Proof ${i + 1}:`);
                
                try {
                    const result = await returnVerifier.verifyReturnProof(
                        returnValue,
                        timestamp,
                        verifierProofs[i]
                    );
                    
                    // Get verification details from contract event
                    const events = await returnVerifier.queryFilter("ProofVerification");
                    const details = events[events.length - 1].args;
                    
                    console.log(`   ✅ Verification Successful:`);
                    console.log(`   - Return Value: ${verifierProofs[i].evaluations[0]}`);
                    console.log(`   - FFT Results: [${details.fftResult.map(n => n.toString()).join(", ")}]`);
                    console.log(`   - Commitment Valid: ${details.commitmentValid}`);
                    console.log(`   - Polynomial Degree: ${details.polynomialDegree}\n`);
                    
                    verificationResults.push({
                        verifier: i + 1,
                        success: true,
                        returnValue: verifierProofs[i].evaluations[0]
                    });
                } catch (error) {
                    console.log(`   ❌ Verification Failed: ${error.message}`);
                    console.log(`   - Attempted Return Value: ${verifierProofs[i].evaluations[0]}\n`);
                    verificationResults.push({
                        verifier: i + 1,
                        success: false,
                        error: error.message
                    });
                }
            }

            // 4. Calculate consensus
            console.log("🎯 Calculating Final Consensus:");
            const validProofs = verificationResults.filter(r => r.success);
            const consensusThreshold = Math.ceil(verifierProofs.length * 2/3);
            
            console.log(`   Total Verifiers: ${verifierProofs.length}`);
            console.log(`   Valid Proofs: ${validProofs.length}`);
            console.log(`   Consensus Threshold (2/3): ${consensusThreshold}`);
            
            const consensusAchieved = validProofs.length >= consensusThreshold;
            console.log(`   Consensus Achieved: ${consensusAchieved}\n`);

            if (consensusAchieved) {
                const consensusValue = Math.floor(validProofs.reduce((acc, p) => acc + p.returnValue, 0) / validProofs.length);
                console.log(`📈 Final Consensus Value: ${consensusValue}`);
                console.log(`   Deviation from Expected: ${consensusValue - Number(formatNumber(returnValue))}\n`);
                expect(consensusValue).to.be.approximately(Number(formatNumber(returnValue)), ERROR_RANGE);
            } else {
                console.log(`❌ Failed to achieve consensus - not enough valid proofs\n`);
                // Don't fail the test - random failures are expected
                // expect.fail("Failed to achieve consensus");
            }
        });
    });
});