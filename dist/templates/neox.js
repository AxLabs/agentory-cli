/**
 * Neo X T4 templates
 *
 * agent0-sdk does not support Neo X. Generated projects use direct viem calls
 * against the Identity Registry, copying the CLI's self-contained neox library.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasFeature } from "../wizard.js";
import { DEFAULT_FIXTURE_IMAGE_URI, NEOX_T4_CHAIN_ID, NEOX_T4_EXPLORER_URL, NEOX_T4_FAUCET_URL, NEOX_T4_IDENTITY_REGISTRY, NEOX_T4_NATIVE_CURRENCY, NEOX_T4_RPC_URL, } from "../neox/constants.js";
import { buildNeoxRegistrationServices } from "../neox-registration-services.js";
export { isNeoxChain, NEOX_T4_CHAIN_KEY, NEOX_T4_CHAIN_ID, NEOX_T4_IDENTITY_REGISTRY, } from "../neox/constants.js";
export function getNeoxIdentityRegistry() {
    return NEOX_T4_IDENTITY_REGISTRY;
}
export async function resolveNeoxLibraryDir() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.resolve(here, "../../src/neox"),
        path.resolve(process.cwd(), "src/neox"),
        path.resolve(here, "../neox"),
    ];
    for (const dir of candidates) {
        try {
            const entries = await fs.readdir(dir);
            if (entries.some((name) => name.startsWith("constants."))) {
                return dir;
            }
        }
        catch {
            // try next
        }
    }
    throw new Error("Neo X library sources were not found next to the CLI");
}
export async function copyNeoxLibrary(projectPath) {
    const sourceDir = await resolveNeoxLibraryDir();
    const destDir = path.join(projectPath, "src", "neox");
    await fs.mkdir(destDir, { recursive: true });
    const entries = await fs.readdir(sourceDir);
    const preferTs = entries.some((name) => name.endsWith(".ts"));
    const copyDirectory = async (source, destination) => {
        await fs.mkdir(destination, { recursive: true });
        for (const entry of await fs.readdir(source, { withFileTypes: true })) {
            const from = path.join(source, entry.name);
            const to = path.join(destination, entry.name);
            if (entry.isDirectory()) {
                await copyDirectory(from, to);
            }
            else if (preferTs
                ? entry.name.endsWith(".ts")
                : entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
                await fs.copyFile(from, to);
            }
        }
    };
    await copyDirectory(sourceDir, destDir);
}
export function generateNeoxPackageJson(answers) {
    const scripts = {
        build: "tsc",
        preflight: "tsx src/register.ts preflight",
        "dry-run": "tsx src/register.ts dry-run",
        register: "tsx src/register.ts register",
        verify: "tsx src/register.ts verify",
        logs: "tsx src/register.ts logs",
    };
    const dependencies = {
        viem: "^2.21.0",
        dotenv: "^16.3.1",
    };
    const devDependencies = {
        "@types/node": "^20.10.0",
        tsx: "^4.7.0",
        typescript: "^5.3.0",
    };
    if (hasFeature(answers, "a2a") || hasFeature(answers, "mcp")) {
        dependencies["openai"] = "^4.68.0";
    }
    if (hasFeature(answers, "a2a")) {
        scripts["start:a2a"] = "tsx src/a2a-server.ts";
        dependencies["express"] = "^4.18.2";
        dependencies["uuid"] = "^9.0.0";
        devDependencies["@types/express"] = "^4.17.21";
        devDependencies["@types/uuid"] = "^9.0.7";
    }
    if (hasFeature(answers, "mcp")) {
        scripts["start:mcp"] = "tsx src/mcp-server.ts";
        dependencies["@modelcontextprotocol/sdk"] = "^1.0.0";
    }
    return JSON.stringify({
        name: answers.agentName.toLowerCase().replace(/\s+/g, "-"),
        version: "1.0.0",
        description: answers.agentDescription,
        type: "module",
        scripts,
        dependencies,
        devDependencies,
    }, null, 2);
}
export function generateNeoxEnvExample(_answers, chain) {
    const storage = _answers.metadataStorage === "neofs"
        ? `
# Direct NeoFS publication. The bearer token is optional for public-write containers.
NEOFS_REST_GATEWAY=
NEOFS_CONTAINER_ID=
NEOFS_PUBLIC_GATEWAY=
NEOFS_BEARER_TOKEN=
`
        : _answers.metadataStorage === "managed" || _answers.metadataStorage === undefined
            ? `
# Required for managed metadata. Agentory API origin only; there is no built-in default.
# The client appends /api/registration-metadata. Do not put a NeoFS credential or the signing key here.
AGENTORY_API_BASE_URL=
`
            : "";
    return `# Secret-free example. Copy to .env locally; never commit keys.
# Provide exactly one of:
PRIVATE_KEY=
PRIVATE_KEY_FILE=

# RPC and registry are overridable. Writes require eth_chainId == ${chain.chainId}.
RPC_URL=${chain.rpcUrl}
IDENTITY_REGISTRY=${NEOX_T4_IDENTITY_REGISTRY}
CHAIN_ID=${chain.chainId}
${storage}
`;
}
export function generateNeoxAgentConfig(answers) {
    const image = answers.agentImage?.trim() || DEFAULT_FIXTURE_IMAGE_URI;
    const projectId = answers.agentName.toLowerCase().replace(/\s+/g, "-");
    const services = buildNeoxRegistrationServices(answers);
    const servicesBlock = services.length > 0
        ? `  services: ${JSON.stringify(services, null, 2).replace(/\n/g, "\n  ")},
`
        : "";
    return `import type { AgentProjectConfig } from "./neox/types.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "./neox/constants.js";

/**
 * Edit \`services[].endpoint\` (and optional OASF fields) before \`npm run register\`.
 * ${answers.metadataStorage === "uri" ? "Keep these declarations aligned with your user-managed metadata; the CLI does not rewrite its contents." : "These values are written into ERC-8004 registration-v1 metadata at setAgentURI time."}
 */
export const AGENT_PROJECT_CONFIG: AgentProjectConfig = {
  name: ${JSON.stringify(answers.agentName)},
  description: ${JSON.stringify(answers.agentDescription)},
  image: ${JSON.stringify(image)},
  projectId: ${JSON.stringify(projectId)},
  registry: NEOX_T4_IDENTITY_REGISTRY,
  metadataStorage: ${JSON.stringify(answers.metadataStorage ?? "managed")},
${answers.metadataStorage === "uri" ? `  metadataUri: ${JSON.stringify(answers.metadataUri ?? "")},
` : ""}${servicesBlock}};
`;
}
export function generateNeoxRegisterEntry() {
    return `/**
 * Neo X T4 ERC-8004 identity registration
 *
 * Commands:
 *   npm run preflight   # read-only dry-run
 *   npm run dry-run     # alias for preflight
 *   npm run register    # mint with register(), then setAgentURI; resumable
 *   npm run verify      # ownerOf / tokenURI / getAgentWallet readback
 */

import "dotenv/config";
import { AGENT_PROJECT_CONFIG } from "./agent-config.js";
import { runNeoxRegistrationCli } from "./neox/cli.js";

runNeoxRegistrationCli(AGENT_PROJECT_CONFIG).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Registration failed:", message);
  process.exit(1);
});
`;
}
export function generateNeoxReadme(answers, chain) {
    const hasA2A = hasFeature(answers, "a2a");
    const hasMCP = hasFeature(answers, "mcp");
    const storage = answers.metadataStorage ?? "managed";
    const neofs = storage === "neofs";
    const managed = storage === "managed";
    const userUri = storage === "uri";
    const hasOasfTaxonomy = (answers.skills?.length ?? 0) > 0 || (answers.domains?.length ?? 0) > 0;
    return `# ${answers.agentName}

${answers.agentDescription}

This project registers an ERC-8004 identity on **${chain.name}** through a guarded, resumable flow.
Pinata is not required. OpenAI is needed only when the generated agent runtime uses A2A or MCP capabilities.

## Network

- Chain ID: \`${NEOX_T4_CHAIN_ID}\`
- Native currency: ${NEOX_T4_NATIVE_CURRENCY.name} (${NEOX_T4_NATIVE_CURRENCY.symbol}, ${NEOX_T4_NATIVE_CURRENCY.decimals} decimals)
- RPC (overridable via \`RPC_URL\`): \`${NEOX_T4_RPC_URL}\`
- Identity registry (overridable via \`IDENTITY_REGISTRY\`): \`${NEOX_T4_IDENTITY_REGISTRY}\`
- Explorer: ${NEOX_T4_EXPLORER_URL}

## 1. Install

\`\`\`bash
npm install
\`\`\`

## 2. Configure a signing key

Copy \`.env.example\` to \`.env\` if you want local overrides. Do not commit secrets.

\`\`\`bash
export PRIVATE_KEY_FILE=/path/to/gitignored-key
# or: export PRIVATE_KEY=0x...
export RPC_URL=${NEOX_T4_RPC_URL}
\`\`\`

The register script derives the public address locally and never prints the key.

${managed ? `Registration metadata is stored by Agentory on NeoFS. You do not create a NeoFS account, fund a container, choose a gateway, or provide an upload token. The signing key stays on this machine and is not sent to Agentory.

Set \`AGENTORY_API_BASE_URL\` to the Agentory API origin before \`npm run register\`. The client uses that origin only and appends \`/api/registration-metadata\`. It does not infer the origin from the chain, and it does not infer the chain from the origin. Registration fails before minting when the variable is missing.

Staging/development example, for Neo X T4:

\`\`\`env
AGENTORY_API_BASE_URL=https://staging.agentory.xyz
\`\`\`
` : userUri ? `This project registers the metadata URI already in \`src/agent-config.ts\`:

\`${answers.metadataUri}\`

The URI is registered exactly as supplied. The CLI validates its syntax locally but does not fetch, upload, normalize, rewrite, or remotely verify the referenced contents. It does not read \`AGENTORY_API_BASE_URL\` and does not ask for a NeoFS, Pinata, or IPFS credential. You are responsible for public readability, correct ERC-8004 metadata, and availability. Treat metadata as immutable: publish a new versioned URI when contents change rather than mutating content at the registered URI.
` : neofs ? `This project publishes metadata to NeoFS. Configure the existing container and gateways in \`.env\`:

\`\`\`env
NEOFS_REST_GATEWAY=https://your-rest-gateway.example
NEOFS_CONTAINER_ID=your-container-id
NEOFS_PUBLIC_GATEWAY=https://your-public-gateway.example
NEOFS_BEARER_TOKEN= # optional for a public-write container
\`\`\`

The REST gateway controls uploads. The public gateway must serve unauthenticated HTTPS reads. Never commit the bearer token.
The backend is selected by \`metadataStorage\` in \`src/agent-config.ts\`. To fall back before registration completes, change it from \`"neofs"\` to \`"inline"\`; NeoFS environment variables are then ignored.
` : `Metadata uses the inline data-URI backend, so no external storage configuration is required.
`}

## 3. Fund the signer with testnet GAS

Address shown by \`npm run preflight\`. Faucet: ${NEOX_T4_FAUCET_URL}

## 4. Preflight (read-only)

Checks \`eth_chainId === ${NEOX_T4_CHAIN_ID}\`, registry bytecode, \`name()\` / \`getVersion()\`,
GAS balance, simulates the next call, and quotes fees from the Neo X RPC
(minimum 20 gwei priority fee). No transaction is sent.

\`\`\`bash
npm run preflight
\`\`\`

## 5. Register or resume

\`\`\`bash
npm run register
\`\`\`

This:

1. Calls parameterless \`register()\` and decodes \`Registered\` from that receipt (agent ID 0 is valid).
2. ${managed ? "Sends the registration-v1 JSON to Agentory after minting and uses the returned `neofs:<containerId>/<objectId>` URI unchanged." : userUri ? "Uses the configured metadata URI unchanged. There is no upload and no storage-provider API call." : neofs ? "Uploads compact registration-v1 JSON to NeoFS, reads it back through the public gateway, and persists the object IDs." : "Encodes compact registration-v1 metadata as a `data:application/json;base64,` URI."}
3. Calls \`setAgentURI(agentId, uri)\`.
4. Persists transaction hashes immediately and resumes metadata publication if minting already succeeded.
5. Refuses to mint a second identity once this project has completed.

${userUri ? "Selected capabilities must already be present in the user-managed registration metadata. Keep them aligned with `services` in `src/agent-config.ts`; the CLI does not add or rewrite them." : "Selected capabilities are declared under `services` in registration-v1 metadata (see `src/agent-config.ts`)."}
Endpoints are self-declared — deploy or configure the real public URLs before registering.
After Agentory indexes the registration, find and inspect the agent in [Agentory staging](https://staging.agentory.xyz).
The Neo X T4 explorer confirms transactions; Agentory staging confirms that the agent has been indexed for discovery.

${userUri ? "Your user-managed metadata is responsible for all ERC-8004 fields and the exact registration reference." : "Compact metadata also sets `active: false`, `x402Support: false`, and `supportedTrust: []`."}

## 6. Verify

\`\`\`bash
npm run verify
\`\`\`

Reads \`ownerOf\`, \`tokenURI\`, and \`getAgentWallet\`, ${userUri ? "checks that the on-chain URI matches the configured metadata URI exactly," : "checks registration metadata (including `services`),"}
then writes secret-free \`registration-result.json\`.
${userUri ? "User-provided URIs are verified for exact on-chain equality without fetching their contents." : "For HTTP(S) URIs it retrieves the metadata before validating the exact Neo X registration reference and service declarations."}

## ERC-8004 service endpoints

Edit \`src/agent-config.ts\` → \`services\` before \`npm run register\` or when resuming after a failed \`setAgentURI\`.
${hasA2A ? `
- **A2A**: must match your deployed agent card at \`/.well-known/agent-card.json\` (local dev: \`npm run start:a2a\` serves the generated card on port 3000).
` : ""}${hasMCP ? `
- **MCP (local)**: \`npm run start:mcp\` runs a stdio MCP server — it does not listen on HTTP and is not the ERC-8004 advertised endpoint.
- **MCP (ERC-8004)**: add an \`MCP\` entry under \`services\` only when you expose a real public HTTP(S) URL (gateway, sidecar, or hosted server). Leave it out for stdio-only MCP.
` : ""}${hasOasfTaxonomy ? `
- **OASF**: skills/domains are advertised only together with your own OASF service/resource endpoint in \`services\`. Use the [OASF taxonomy](https://github.com/8004-org/oasf) to pick valid values — do not use the taxonomy repo URL as your agent endpoint.
` : ""}

## Transaction links

Explorer transactions: \`${NEOX_T4_EXPLORER_URL}/tx/<hash>\`
${hasA2A ? `
## Local A2A server

\`\`\`bash
npm run start:a2a
\`\`\`

Serves \`.well-known/agent-card.json\` on \`http://localhost:3000\`. Point the A2A service endpoint in \`agent-config.ts\` at your public URL before registration.
` : ""}${hasMCP ? `
## Local MCP server (stdio)

\`\`\`bash
npm run start:mcp
\`\`\`

\`npm run start:mcp\` does not serve the HTTP URL in ERC-8004 metadata. When you deploy an HTTP MCP gateway, set that public URL in \`agent-config.ts\` before registration.
` : ""}
## Resources

- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
- [OASF taxonomy](https://github.com/8004-org/oasf)
- [Neo X T4 explorer](${NEOX_T4_EXPLORER_URL})
`;
}
export function generateNeoxGitignore() {
    return `node_modules/
dist/
.env
.registration-state.json
registration-result.json
*.log
`;
}
