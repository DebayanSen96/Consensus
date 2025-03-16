const { ethers } = require("hardhat");
const chalk = require("chalk");

// ANSI escape codes for terminal control
const CLEAR_SCREEN = '\x1b[2J';
const MOVE_TO_TOP = '\x1b[H';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

// Handle exit gracefully
process.on('SIGINT', () => {
    process.stdout.write(SHOW_CURSOR);
    console.log(chalk.yellow('\n\nSimulation terminated by user'));
    process.exit(0);
});

// Farm performance metrics
class Farm {
    constructor(id) {
        this.id = id;
        this.returns = [];
        this.volatility = 0;
        this.sharpeRatio = 0;
        this.sortinoRatio = 0;
        this.maxDrawdown = 0;
        this.performanceScore = 0;
        this.type = getFarmType(id);
    }

    updateMetrics() {
        if (this.returns.length === 0) return;

        // Calculate farm metrics based on historical returns
        const avgReturn = this.returns.reduce((a, b) => a + b, 0) / this.returns.length;
        this.volatility = Math.sqrt(this.returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / this.returns.length);
        
        // Calculate Sharpe ratio (assuming 2% risk-free rate)
        this.sharpeRatio = (avgReturn - 0.02) / this.volatility; 
        
        // Calculate Sortino ratio (only considering downside deviation)
        const negativeReturns = this.returns.filter(ret => ret < 0);
        const downsideDeviation = negativeReturns.length > 0 ? 
            Math.sqrt(negativeReturns.reduce((sum, ret) => sum + Math.pow(ret, 2), 0) / negativeReturns.length) : 0.001;
        this.sortinoRatio = (avgReturn - 0.02) / downsideDeviation;
        
        // Calculate max drawdown
        let peak = -Infinity;
        let maxDrawdown = 0;
        let cumulativeReturn = 1;

        for (const ret of this.returns) {
            cumulativeReturn *= (1 + ret/100);
            if (cumulativeReturn > peak) peak = cumulativeReturn;
            const drawdown = (peak - cumulativeReturn) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        this.maxDrawdown = maxDrawdown * 100;
        
        // Calculate performance score (weighted combination of metrics)
        this.performanceScore = (this.sharpeRatio * 0.4) + (this.sortinoRatio * 0.4) - (this.maxDrawdown * 0.01) + (avgReturn * 2);
    }
}

// Farm types
const FARM_TYPES = [
    'Yield Farming',
    'Lending',
    'Staking',
    'Liquidity Pool',
    'Options Vault'
];

function getFarmType(id) {
    // Assign a type based on farm ID (deterministic but seems random)
    const index = id.charCodeAt(0) % FARM_TYPES.length;
    return FARM_TYPES[index];
}

// Simulation parameters
const NUM_FARMS = 20;
const NUM_VERIFIERS = 20;
const UPDATE_INTERVAL = 2000; // Update every 2 seconds

// Helper functions
function generateScore() {
    return 7.5 + Math.random() * 2;
}

function formatNumber(num) {
    // Handle very large numbers (like Infinity) by capping at 9999.9
    if (num > 9999.9) return 9999.9;
    return Number(num.toFixed(1));
}

function generateVerifierStats(verifierId, baseAccuracy) {
    return {
        id: verifierId,
        accuracy: 0, // Start at 0%
        avgResponseTime: formatNumber(2 + Math.random() * 3),
        successfulVerifications: 0, // Start at 0
        totalVerifications: 0
    };
}

function calculateConsensusScore(scores) {
    const sum = scores.reduce((a, b) => a + b, 0);
    return formatNumber(sum / scores.length);
}

function clearScreen() {
    // Move cursor to 0,0 and clear everything below
    process.stdout.write('\x1b[0;0H\x1b[J');
}

async function simulateRound(farms, verifierStats) {
    for (let farmId = 0; farmId < NUM_FARMS; farmId++) {
        const farmName = String.fromCharCode(65 + farmId);
        
        // Generate 3 random verifier scores for each farm
        const verifierScores = new Map(); // Map to store verifier scores
        const usedVerifiers = new Set();

        for (let i = 0; i < 3; i++) {
            let verifierId;
            do {
                verifierId = Math.floor(Math.random() * NUM_VERIFIERS) + 1;
            } while (usedVerifiers.has(verifierId));
            usedVerifiers.add(verifierId);

            const score = formatNumber(generateScore());
            verifierScores.set(verifierId, score);
        }

        // Calculate consensus score
        const consensusScore = calculateConsensusScore(Array.from(verifierScores.values()));
        
        // Update verifier stats based on how close they were to consensus
        for (const [verifierId, score] of verifierScores) {
            const stats = verifierStats.get(verifierId);
            stats.totalVerifications++;
            
            // Consider a verification successful if within 0.5 of consensus
            const deviation = Math.abs(score - consensusScore);
            if (deviation <= 0.5) {
                stats.successfulVerifications++;
            }
            
            // Update accuracy (successful/total), capped at 100%
            stats.accuracy = Math.min(100, (stats.successfulVerifications / stats.totalVerifications) * 100);
        }

        // Update farm metrics
        const farm = farms.get(farmName);
        const monthlyReturn = (consensusScore - 8) * 10; // Convert score to percentage return
        farm.returns.push(monthlyReturn);
        farm.updateMetrics();
    }
}

async function displayRankings(farms, verifierStats) {
    clearScreen();
    const now = new Date().toLocaleString();
    process.stdout.write('\x1b[?25l'); // Hide cursor while updating
    
    let output = '';
    output += chalk.cyan.bold(`=== Consensus Live Rankings (${now}) ===\n\n`);
    output += chalk.yellow.bold("=== Farm Performance Rankings ===\n");
    output += chalk.gray("Sorted by Sharpe Ratio | Returns shown as monthly %\n");
    
    // Sort and display farm rankings
    const farmArray = Array.from(farms.values());
    farmArray.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
    
    for (const farm of farmArray) {
        const avgReturn = farm.returns.length > 0 ? 
            formatNumber(farm.returns.reduce((a, b) => a + b, 0) / farm.returns.length) : 0;
        output += chalk.white.bold(`Farm ${farm.id.padEnd(2)}`) + 
            chalk.blue(` [${farm.type.padEnd(14)}]`) +
            chalk.gray(` Score: ${formatNumber(farm.performanceScore).toString().padStart(6)} `) +
            chalk.gray(`| Return: ${avgReturn.toString().padStart(5)}% `) +
            chalk.gray(`| Vol: ${formatNumber(farm.volatility).toString().padStart(5)}% `) +
            chalk.gray(`| Sharpe: ${formatNumber(farm.sharpeRatio).toString().padStart(5)} `) +
            chalk.gray(`| Sortino: ${formatNumber(farm.sortinoRatio).toString().padStart(5)} `) +
            chalk.gray(`| MaxDD: ${formatNumber(farm.maxDrawdown).toString().padStart(5)}% `) + '\n';
    }

    output += '\n' + chalk.yellow.bold("=== Verifier Rankings ===\n");
    output += chalk.gray("Sorted by Accuracy > Response Time > Success Count\n");
    
    // Sort and display verifier rankings
    const verifierArray = Array.from(verifierStats.entries());
    verifierArray.sort((a, b) => {
        if (a[1].accuracy !== b[1].accuracy) return b[1].accuracy - a[1].accuracy;
        if (a[1].avgResponseTime !== b[1].avgResponseTime) return a[1].avgResponseTime - b[1].avgResponseTime;
        return b[1].successfulVerifications - a[1].successfulVerifications;
    });
    
    for (const [id, stats] of verifierArray) {
        const rank = (verifierArray.findIndex(v => v[0] === id) + 1).toString().padStart(2);
        output += chalk.white.bold(`${rank}. V${id.toString().padStart(2)}`) +
            chalk.gray(` | Acc: ${formatNumber(stats.accuracy).toString().padStart(5)}% `) +
            chalk.gray(`| Time: ${stats.avgResponseTime.toString().padStart(3)} min `) +
            chalk.gray(`| Success: ${stats.successfulVerifications.toString().padStart(3)}`) + '\n';
    }
    
    output += '\n' + chalk.gray("Press Ctrl+C to stop the simulation");
    
    // Write everything at once
    process.stdout.write(output);
    process.stdout.write('\x1b[?25h'); // Show cursor after update
}

async function main() {
    // Initialize farms
    const farms = new Map();
    for (let i = 0; i < NUM_FARMS; i++) {
        farms.set(String.fromCharCode(65 + i), new Farm(String.fromCharCode(65 + i)));
    }

    // Initialize verifier stats
    const verifierStats = new Map();
    for (let i = 1; i <= NUM_VERIFIERS; i++) {
        verifierStats.set(i, generateVerifierStats(i, 85));
    }

    // Hide cursor during simulation
    process.stdout.write(HIDE_CURSOR);

    // Run simulation continuously
    while (true) {
        await simulateRound(farms, verifierStats);
        await displayRankings(farms, verifierStats);
        await new Promise(resolve => setTimeout(resolve, UPDATE_INTERVAL));
    }
}

// Execute the simulation
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
