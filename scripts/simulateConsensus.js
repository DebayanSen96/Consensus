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
        // Use minimum acceptable return (MAR) of 0.02 (2%)
        const MAR = 0.02;
        const downside = this.returns.map(ret => Math.max(MAR - ret, 0));
        const downsideDeviation = Math.sqrt(downside.reduce((sum, d) => sum + Math.pow(d, 2), 0) / this.returns.length);
        // Add a minimum value to prevent division by zero or extremely high values
        this.sortinoRatio = (avgReturn - MAR) / Math.max(downsideDeviation, 0.5);
        
        // Calculate max drawdown with a more realistic approach
        let peak = 1;  // Start at 1 (100%)
        let maxDrawdown = 0;
        let cumulativeReturn = 1;

        // Ensure we have at least some drawdown for realism
        let hasDrawdown = false;
        
        for (const ret of this.returns) {
            cumulativeReturn *= (1 + ret/100);
            if (cumulativeReturn > peak) {
                peak = cumulativeReturn;
            } else if (cumulativeReturn < peak) {
                const drawdown = (peak - cumulativeReturn) / peak;
                if (drawdown > maxDrawdown) {
                    maxDrawdown = drawdown;
                    hasDrawdown = true;
                }
            }
        }
        
        // If no natural drawdown or very small drawdown, add a more realistic one
        if ((!hasDrawdown || maxDrawdown < 0.005) && this.returns.length > 3) {
            // Base drawdown on volatility and farm type
            let drawdownFactor = 0;
            
            switch(this.type) {
                case 'Yield Farming':
                    drawdownFactor = 1.5 + Math.random();  // Higher risk
                    break;
                case 'Lending':
                    drawdownFactor = 0.8 + Math.random() * 0.7;  // Lower risk
                    break;
                case 'Staking':
                    drawdownFactor = 1.0 + Math.random() * 0.8;  // Medium risk
                    break;
                case 'Liquidity Pool':
                    drawdownFactor = 1.2 + Math.random() * 1.0;  // Higher risk
                    break;
                case 'Options Vault':
                    drawdownFactor = 1.8 + Math.random() * 1.2;  // Highest risk
                    break;
                default:
                    drawdownFactor = 1.0 + Math.random();
            }
            
            maxDrawdown = Math.max(0.01, this.volatility / 100 * drawdownFactor);
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
    // Ensure at least one decimal place for consistency
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
    // Market trend factor (affects all farms to some degree)
    const marketTrend = (Math.random() * 4) - 2; // -2% to +2% market movement
    
    for (let farmId = 0; farmId < NUM_FARMS; farmId++) {
        const farmName = String.fromCharCode(65 + farmId);
        const farm = farms.get(farmName);
        
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

        // Generate return based on farm type, market trend, and some randomness
        let baseReturn = (consensusScore - 8) * 10; // Convert score to percentage return
        
        // Apply farm type-specific adjustments
        switch(farm.type) {
            case 'Yield Farming':
                // Higher volatility, higher potential returns
                baseReturn += (Math.random() * 4) - 2;
                break;
            case 'Lending':
                // More stable returns, lower volatility
                baseReturn = baseReturn * 0.8 + 1;
                break;
            case 'Staking':
                // Moderate returns, moderate volatility
                baseReturn = baseReturn * 0.9 + 0.5;
                break;
            case 'Liquidity Pool':
                // Higher volatility due to impermanent loss risk
                baseReturn += (Math.random() * 5) - 2.5;
                break;
            case 'Options Vault':
                // Highest volatility
                baseReturn += (Math.random() * 6) - 3;
                break;
        }
        
        // Apply market trend (correlation between farms)
        const monthlyReturn = baseReturn + (marketTrend * (0.5 + Math.random() * 0.5));
        
        // Add the return and update metrics
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
