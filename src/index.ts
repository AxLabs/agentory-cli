#!/usr/bin/env node
import chalk from "chalk";
import ora from "ora";
import { execSync } from "child_process";
import { runWizard, hasFeature, isSolanaChain } from "./wizard.js";
import { generateProject } from "./generator.js";
import { maybeRegisterWithFourmica } from "./fourmica.js";
import { readGenerateConfigFile, wizardAnswersFromConfig } from "./generate-from-config.js";
import { isNeoxChain } from "./neox/constants.js";
import {
    NEOX_T4_FAUCET_URL,
    NEOX_T4_NATIVE_CURRENCY,
} from "./neox/constants.js";
import type { WizardAnswers } from "./wizard.js";

function parseArgs(argv: string[]) {
    const args = { configPath: "", skipInstall: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--config" || arg === "-c") {
            args.configPath = argv[i + 1] ?? "";
            i++;
        } else if (arg.startsWith("--config=")) {
            args.configPath = arg.slice("--config=".length);
        } else if (arg === "--skip-install") {
            args.skipInstall = true;
        } else if (arg === "--help" || arg === "-h") {
            printHelp();
            process.exit(0);
        }
    }
    return args;
}

function printHelp(): void {
    console.log(`agentory

Usage:
  agentory
  agentory --config <file.json> [--skip-install]

The --config path uses the same generator as the interactive wizard.
`);
}

function printNextSteps(answers: WizardAnswers, isSolana: boolean, neox: boolean): void {
    let step = 1;

    console.log(chalk.bold.cyan("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(chalk.bold.cyan("  🚀 NEXT STEPS"));
    console.log(chalk.bold.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

    if (answers.projectDir !== ".") {
        console.log(chalk.bold.white(`${step}. Navigate to your project`));
        console.log(chalk.gray(`   cd ${answers.projectDir}\n`));
        step++;
    }

    if (answers.generatedPrivateKey) {
        console.log(chalk.bold.white(`${step}. Back up your wallet`));
        console.log(chalk.yellow("   ⚠️  A new wallet was generated"));
        console.log(chalk.gray(`   Address: ${answers.agentWallet}`));
        console.log(chalk.gray("   → Keep the key in a gitignored file; never commit it.\n"));
        step++;
    }

    console.log(chalk.bold.white(`${step}. Configure environment`));
    if (neox) {
        console.log(chalk.gray("   - Set PRIVATE_KEY or PRIVATE_KEY_FILE"));
        console.log(chalk.gray("   - Optional: RPC_URL, IDENTITY_REGISTRY"));
        if (answers.metadataStorage === "neofs") {
            console.log(chalk.gray("   - Set NEOFS_REST_GATEWAY, NEOFS_CONTAINER_ID, and NEOFS_PUBLIC_GATEWAY"));
            console.log(chalk.gray("   - Set NEOFS_BEARER_TOKEN only when the container requires it"));
        }
        console.log(chalk.gray("   - Pinata and OpenAI are not required for Neo X Web3 registration"));
    } else {
        if (!answers.generatedPrivateKey) {
            console.log(chalk.gray(`   - Add ${isSolana ? "SOLANA_PRIVATE_KEY" : "PRIVATE_KEY"}`));
        }
        console.log(chalk.gray("   - Add OPENAI_API_KEY"));
        if (answers.metadataStorage !== "external") {
            console.log(chalk.gray("   - Add PINATA_JWT (get one at pinata.cloud)"));
        }
    }
    console.log("");
    step++;

    if (isSolana) {
        console.log(chalk.bold.white(`${step}. Fund your wallet with devnet SOL`));
        console.log(chalk.gray("   → https://faucet.solana.com/\n"));
    } else if (neox) {
        console.log(chalk.bold.white(`${step}. Fund your wallet with Neo X T4 ${NEOX_T4_NATIVE_CURRENCY.symbol}`));
        console.log(chalk.gray(`   → ${NEOX_T4_FAUCET_URL}\n`));
    } else {
        console.log(chalk.bold.white(`${step}. Fund the signing wallet`));
        console.log(chalk.gray("   → Use the selected network's native gas token; see the generated README.\n"));
    }
    step++;

    if (hasFeature(answers, "a2a")) {
        console.log(chalk.bold.white(`${step}. Start & deploy your A2A server`));
        console.log(chalk.cyan("   npm run start:a2a"));
        console.log(chalk.gray("   → Test locally: http://localhost:3000/.well-known/agent-card.json\n"));
        step++;
    }

    if (hasFeature(answers, "mcp")) {
        console.log(chalk.bold.white(`${step}. Start your MCP server`));
        console.log(chalk.cyan("   npm run start:mcp\n"));
        step++;
    }

    if (neox) {
        console.log(chalk.bold.white(`${step}. Preflight, register, and verify on Neo X T4`));
        console.log(chalk.cyan("   npm run preflight"));
        console.log(chalk.cyan("   npm run register"));
        console.log(chalk.cyan("   npm run verify\n"));
        console.log(chalk.gray("   Registration is resumable. A completed project will not mint again."));
        console.log(chalk.gray("   Explorer: https://xt4scan.ngd.network\n"));
    } else {
        console.log(chalk.bold.white(`${step}. Register the agent's Web3 identity`));
        console.log(chalk.cyan("   npm run register\n"));
    }

    console.log(chalk.bold.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    if (isSolana) {
        console.log(chalk.gray("Learn more: https://8004.org"));
    } else {
        console.log(chalk.gray("Learn more: https://eips.ethereum.org/EIPS/eip-8004"));
    }
    console.log("");
}

async function generateFromAnswers(answers: WizardAnswers, skipInstall: boolean): Promise<void> {
    console.log("\n");
    const spinner = ora("Generating project files...").start();
    await generateProject(answers);
    const isSolana = isSolanaChain(answers.chain);
    const neox = isNeoxChain(answers.chain);
    spinner.succeed(chalk.green("Agentory project generated successfully!"));

    if (!skipInstall) {
        const installDir = answers.projectDir === "." ? process.cwd() : answers.projectDir;
        const installSpinner = ora("Installing dependencies...").start();
        try {
            execSync("npm install", {
                cwd: installDir,
                stdio: "pipe",
            });
            installSpinner.succeed(chalk.green("Dependencies installed successfully!"));
        } catch {
            installSpinner.fail(chalk.yellow("Failed to install dependencies. Run 'npm install' manually."));
        }
    }

    if (!neox && !isSolana) {
        await maybeRegisterWithFourmica(answers);
    }

    printNextSteps(answers, isSolana, neox);
}

async function main() {
    console.log(chalk.bold.cyan("\n🤖 Agentory CLI\n"));
    console.log(chalk.gray("Create an AI agent project and its Web3 registration flow\n"));
    console.log(chalk.gray("Primary staging path: Neo X (T4 testnet)\n"));

    try {
        const { configPath, skipInstall } = parseArgs(process.argv.slice(2));
        if (configPath) {
            const raw = readGenerateConfigFile(configPath);
            const answers = wizardAnswersFromConfig(raw);
            await generateFromAnswers(answers, skipInstall || Boolean(raw.skipInstall));
            return;
        }

        const answers = await runWizard();
        await generateFromAnswers(answers, skipInstall);
    } catch (error) {
        console.error(chalk.red("\n❌ Error:"), error);
        process.exit(1);
    }
}

main();
