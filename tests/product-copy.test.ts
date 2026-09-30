import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAINS } from "../src/config.js";
import { SOLANA_CHAINS } from "../src/config-solana.js";
import {
    generateAgentTs,
    generateReadme,
    generateRegisterScript,
} from "../src/templates/base.js";
import {
    generateMonadReadme,
    generateMonadRegisterScript,
} from "../src/templates/monad.js";
import { generateNeoxReadme } from "../src/templates/neox.js";
import {
    generateAgentTs as generateSolanaAgentTs,
    generateSolanaRegisterScript,
    generateSolanaReadme,
} from "../src/templates/solana.js";
import type { WizardAnswers } from "../src/wizard.js";

function answers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
    return {
        projectDir: "test-agent",
        agentName: "Helpful Agent",
        agentDescription: "Answers useful questions.",
        agentImage: "https://example.com/agent.png",
        features: ["a2a"],
        a2aStreaming: true,
        chain: "base-sepolia",
        trustModels: ["reputation"],
        agentWallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        ...overrides,
    };
}

describe("Agentory product copy", () => {
    it("leads with Agentory and does not send users to inherited product surfaces", () => {
        const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");

        expect(readme).toMatch(/Agentory[^\n]+discovery and trust layer/i);
        expect(readme).not.toContain("8004scan");
        expect(readme).not.toContain("Agent0");
        expect(readme).not.toContain("8004 Agent Generator");
    });

    it("keeps the ordinary EVM implementation dependency out of product messaging", () => {
        const input = answers();
        const chain = CHAINS["base-sepolia"];
        const registerScript = generateRegisterScript(input, chain);
        const generatedReadme = generateReadme(input, chain);

        expect(registerScript).toContain("from 'agent0-sdk'");
        expect(registerScript).toContain("Initializing registration client");
        expect(registerScript).not.toContain("Initializing Agent0 SDK");
        expect(registerScript).not.toContain("8004scan");
        expect(generatedReadme).not.toContain("8004scan");
        expect(generatedReadme).not.toContain("Agent0");
    });

    it("scopes Neo X product terminology to Neo X and T4 to its environment", () => {
        const monadInput = answers({ chain: "monad-testnet" });
        const monadScript = generateMonadRegisterScript(monadInput, CHAINS["monad-testnet"]);
        const monadReadme = generateMonadReadme(monadInput, CHAINS["monad-testnet"]);
        const neoxReadme = generateNeoxReadme(
            answers({ chain: "neox-t4", metadataStorage: "inline" }),
            CHAINS["neox-t4"]
        );

        expect(monadScript).not.toContain("8004scan");
        expect(monadReadme).not.toContain("8004scan");
        expect(neoxReadme).toMatch(/Neo X T4/);
        expect(neoxReadme).toMatch(/After Agentory indexes the registration/);
        expect(neoxReadme).toContain("Neo X T4 explorer");
        expect(neoxReadme).not.toContain("8004scan");
        expect(neoxReadme).not.toContain("Agent0");
    });

    it("keeps generated runtime behavior generic and independent of registration metadata", () => {
        const evmAgent = generateAgentTs(answers());
        const solanaAgent = generateSolanaAgentTs(
            answers({ chain: "solana-devnet" })
        );

        for (const generatedAgent of [evmAgent, solanaAgent]) {
            expect(generatedAgent).toMatch(/You are a helpful AI assistant\./);
            expect(generatedAgent).not.toContain("Helpful Agent");
            expect(generatedAgent).not.toContain("Answers useful questions.");
            expect(generatedAgent).not.toMatch(/registered on (the )?(ERC-)?8004/i);
        }
    });

    it("describes Solana as unsupported identity groundwork without conflating agent and identity", () => {
        const input = answers({ chain: "solana-devnet" });
        const solanaReadme = generateSolanaReadme(
            input,
            SOLANA_CHAINS["solana-devnet"]
        );
        const solanaScript = generateSolanaRegisterScript(
            input,
            SOLANA_CHAINS["solana-devnet"]
        );

        expect(solanaReadme).toContain("not a supported Agentory CLI target");
        expect(solanaReadme).not.toContain("8004scan");
        expect(solanaReadme).not.toMatch(/register your agent|your agent address|your agent wallet/i);
        expect(solanaReadme).toMatch(/on-chain identity/i);
        expect(solanaScript).not.toMatch(/registers your agent|mint your agent NFT|your agent address/i);
        expect(solanaScript).toMatch(/identity asset/i);
    });

    it("documents wallet behavior per target instead of claiming one uniform flow", () => {
        const rootReadme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
        const wizardSource = fs.readFileSync(new URL("../src/wizard.ts", import.meta.url), "utf8");
        const evmReadme = generateReadme(answers(), CHAINS["base-sepolia"]);
        const monadReadme = generateMonadReadme(
            answers({ chain: "monad-testnet" }),
            CHAINS["monad-testnet"]
        );

        expect(rootReadme).toMatch(/Wallet behavior by target/);
        expect(rootReadme).toMatch(/Monad[^\n]+does not record[^\n]+separate agent wallet/);
        expect(rootReadme).toMatch(/Neo X T4[^\n]+does not configure a separate agent wallet/);
        expect(wizardSource).not.toContain("signing/agent wallet");
        expect(evmReadme).toMatch(/Fund the signing wallet configured by `PRIVATE_KEY`/);
        expect(evmReadme).toMatch(/ERC-8004 agent wallet to associate/);
        expect(monadReadme).not.toContain("Your agent wallet");
        expect(monadReadme).toMatch(/does not configure a separate ERC-8004 agent wallet/);
    });
});
