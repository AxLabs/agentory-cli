# Agentory CLI

Agentory is a discovery and trust layer for AI agents, making them easy to find, verify, and interact with across the open agent ecosystem.

Agentory CLI currently scaffolds runnable agent projects and their Web3 registration flows. It uses [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) for on-chain identity and registration metadata, with optional A2A, MCP, and x402 capabilities. Neo X is the primary network focus; the current Agentory staging path uses the Neo X T4 testnet.

Agentory is broader than ERC-8004. An agent is the service people interact with; an ERC-8004 identity is one way to register that agent for Web3 discovery and trust.

## Table of Contents

- [Quick Start](#quick-start)
- [Creating an Agent Project](#creating-an-agent-project)
- [Registering a Web3 Identity](#registering-a-web3-identity)
- [Verifying and Discovering an Agent](#verifying-and-discovering-an-agent)
- [Agent Protocols and Capabilities](#agent-protocols-and-capabilities)
- [Available Web3 Registration Targets](#available-web3-registration-targets)
- [Experimental Solana Groundwork](#experimental-solana-groundwork)
- [How Agentory Uses ERC-8004](#how-agentory-uses-erc-8004)
- [Development](#development)
- [Resources](#resources)

## Quick Start

Agentory CLI is not yet published to npm. Run it from this checkout:

```bash
git clone https://github.com/AxLabs/agentory-cli.git
cd agentory-cli
npm ci
npm run build
node dist/index.js
```

The interactive flow asks what to generate, which Web3 network to target, and which optional protocols to include. For the current Agentory staging flow, choose **Neo X T4**.

For a repeatable noninteractive run, provide a JSON configuration file:

```bash
node dist/index.js --config ./agent.config.json --skip-install
```

## Creating an Agent Project

The CLI collects:

- the agent's name, description, and image;
- a Web3 registration network;
- a wallet address, whose role depends on the selected registration target, or permission to generate a signing wallet;
- optional A2A, MCP, and x402 capabilities;
- public service endpoints and OASF taxonomy data where the target supports them; and
- target-specific registration metadata storage options.

The generated project contains the agent runtime and the scripts required by the selected registration target. Files vary by target, but may include:

```text
my-agent/
├── package.json
├── .env or .env.example
├── src/
│   ├── register.ts
│   ├── agent.ts
│   ├── agent-config.ts          # Neo X
│   ├── a2a-server.ts            # Optional
│   ├── a2a-client.ts            # Optional
│   ├── mcp-server.ts            # Optional
│   └── tools.ts                 # Optional MCP tools
└── .well-known/
    └── agent-card.json          # Optional A2A discovery card
```

Dependencies are installed automatically unless `--skip-install` is supplied. Each generated project has its own README with target-specific setup steps.

### Wallet behavior by target

The **signing wallet** supplies the key used to sign registration transactions and pay network fees. An **ERC-8004 agent wallet** is a separate, optional address associated with the identity where a target and workflow support it.

| Target | Current generated behavior |
| --- | --- |
| Standard EVM targets | `PRIVATE_KEY` signs registration. The wizard's agent-wallet address is associated with the identity through `setAgentWallet()`; when the CLI generates a wallet, the same address is used for both roles. |
| Monad | `PRIVATE_KEY` signs registration and becomes the owner. The generated registration script does not record the wizard-provided address as a separate agent wallet. |
| Neo X T4 | `PRIVATE_KEY` signs registration and becomes the owner. The generated flow does not configure a separate agent wallet; verification reports the value returned by the registry. |

The retained experimental Solana path has its own SDK-specific wallet metadata and is not part of the supported interactive workflow.

Back up generated keys immediately, keep them in gitignored files, and never commit them.

## Registering a Web3 Identity

Registration publishes an ERC-8004 identity and its public registration metadata. Run the commands from the generated project, not from the Agentory CLI repository.

### Neo X staging path

Neo X T4 projects provide a guarded, resumable flow:

```bash
npm run preflight
npm run register
npm run verify
```

- `preflight` checks the T4 chain, registry, signer balance, and next transaction without writing.
- `register` mints the identity, publishes registration metadata, and sets its URI.
- `verify` reads the identity and metadata back and writes a secret-free result file.

Fund the signing wallet with testnet GAS from the [Neo X T4 faucet](https://neoxfaucet.ngd.network/). See the [Neo X T4 demo runbook](docs/neox-t4-demo.md) for the complete staging workflow.

### Registration metadata storage today

Storage behavior is currently target-specific:

| Target | Current behavior |
| --- | --- |
| Neo X T4 | Managed by Agentory (recommended). Agentory stores the registration document on NeoFS and the CLI sets the returned `neofs:<containerId>/<objectId>` URI with the user's wallet. `Use my own URI` registers a URI the user already hosts. Direct NeoFS and inline data URIs remain compatibility paths and are not wizard choices. |
| Other EVM targets | Registration metadata is uploaded to IPFS through Pinata and requires `PINATA_JWT`. |
| Solana groundwork | Uses Pinata/IPFS, but Solana is not a supported Agentory CLI target. |

Managed Neo X registration does not ask for a NeoFS account, container, gateway, or upload token, and it does not send the EVM signing key to Agentory. It requires `AGENTORY_API_BASE_URL` at registration time and does not select that origin from the chain. The direct NeoFS path is an advanced acceptance path. Do not expose its container credentials or bearer token to end users.

### Other EVM targets

Generated projects for the other EVM targets provide:

```bash
npm run register
```

Follow the generated README for the selected network's wallet funding and environment requirements. These projects currently require a signing key, native gas token, and Pinata credentials. They do not provide the Neo X-specific `preflight` and `verify` commands.

The CLI does not currently provide one safe, uniform command for updating an already registered identity. Do not assume that rerunning `npm run register` updates an existing identity; behavior differs by generated target.

## Verifying and Discovering an Agent

For Neo X T4, `npm run verify` confirms the on-chain owner, registry-reported agent wallet, metadata URI, registration reference, and declared services. Transaction links use the [Neo X T4 explorer](https://xt4scan.ngd.network/).

After the Agentory indexer processes the registration, find and inspect the agent in [Agentory staging](https://staging.agentory.xyz). On-chain verification and Agentory discovery are related but separate steps: the first confirms registry state, while the second confirms that Agentory has indexed and presented the agent.

Other scaffold targets currently report their registration result through the generated script. They do not yet share a generic Agentory discovery-verification command.

## Agent Protocols and Capabilities

### A2A

The optional A2A server exposes:

- an Agent Card at `/.well-known/agent-card.json`;
- a JSON-RPC endpoint at `/a2a`; and
- `message/send`, `tasks/get`, and `tasks/cancel` methods.

Run it from a generated project:

```bash
npm run start:a2a
```

For Agentory discovery, registration metadata must declare the deployed public Agent Card URL rather than a localhost address.

### MCP

The optional MCP server includes sample `chat`, `echo`, and `get_time` tools:

```bash
npm run start:mcp
```

The generated server uses stdio. A public MCP URL should be declared in registration metadata only when an HTTP-accessible MCP gateway or hosted service actually exists.

### x402 payments

x402 is an optional capability for adding USDC payment requirements to generated agent endpoints. It is separate from agent registration and is not available on Neo X today.

The current local configuration includes:

| Provider | Configured networks | Role |
| --- | --- | --- |
| PayAI | Base mainnet/Sepolia, Polygon mainnet/Amoy, SKALE Base mainnet/Sepolia | Exact-payment middleware and facilitator |
| 4mica | Ethereum Sepolia, Polygon Amoy | Credit-based middleware with an optional collateral deposit flow |

When a selected network offers multiple providers, the wizard asks which one to use. If 4mica is selected, the CLI can optionally submit a collateral deposit after project generation. This setup is optional and does not belong to the core Quick Start.

Generated payment configuration uses `X402_PAYEE_ADDRESS` and `X402_PRICE`; 4mica projects also use `X402_TAB_ENDPOINT`.

## Available Web3 Registration Targets

The table describes what the CLI exposes today. “Scaffold target” means project generation is available; it does not claim that Agentory currently indexes that network end to end.

| Network | Environment | Registration | Readiness |
| --- | --- | --- | --- |
| **Neo X** | T4 testnet | ERC-8004 | Primary Agentory staging target; preflight, resumable registration, and verification |
| Ethereum | Mainnet, Sepolia | ERC-8004 | Scaffold target |
| Base | Mainnet, Sepolia | ERC-8004 | Scaffold target |
| Polygon | Mainnet, Amoy | ERC-8004 | Scaffold target |
| Avalanche | C-Chain, Fuji | ERC-8004 | Scaffold target |
| Monad | Mainnet, testnet | ERC-8004 | Scaffold target |
| SKALE Base | Mainnet, Sepolia | ERC-8004 | Scaffold target |

Implementation libraries differ by target, but they are not part of Agentory's product-level network model.

## Experimental Solana Groundwork

The repository retains a configuration-only Solana Devnet implementation as groundwork for potential future support. It is not currently a supported Agentory CLI target, is not exposed through the interactive wizard, and has not been validated end to end sufficiently for normal use. See the [Solana support assessment](docs/solana-support-research.md) for the technical status.

## How Agentory Uses ERC-8004

ERC-8004 provides on-chain identity, reputation, and validation mechanisms for AI agents. Agentory can index an ERC-8004 identity and its public metadata to make the associated agent and services discoverable.

A registration metadata document describes the agent rather than defining the agent itself. The Neo X path currently produces registration-v1 metadata shaped like:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "My Agent",
  "description": "An AI agent...",
  "image": "https://example.com/image.png",
  "services": [
    {
      "name": "A2A",
      "endpoint": "https://agent.example/.well-known/agent-card.json",
      "version": "0.3.0"
    }
  ],
  "active": false,
  "x402Support": false,
  "supportedTrust": [],
  "registrations": [
    {
      "agentId": 123,
      "agentRegistry": "eip155:12227332:0x8004..."
    }
  ]
}
```

An agent can expose A2A, MCP, OASF, x402, or other capabilities independently of how its identity is registered.

## Development

```bash
npm ci
npm run build
npm test
```

Additional checks:

```bash
npm run test:neox        # Neo X generator and registration tests
npm run test:integration # Slow generated-project suites across configured EVM targets
npm pack --dry-run       # Inspect the publishable package
```

Paid x402 request tests additionally require `TEST_PAYER_PRIVATE_KEY` and a funded testnet wallet. Without it, those paid cases are skipped.

## Resources

- [Agentory staging](https://staging.agentory.xyz)
- [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Neo X T4 explorer](https://xt4scan.ngd.network/)
- [A2A protocol](https://a2a-protocol.org/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [x402 protocol](https://x402.org)
- [OASF taxonomy](https://github.com/8004-org/oasf)
- [PayAI](https://payai.network)
- [4mica](https://x402.4mica.xyz)
- [8004-solana SDK](https://github.com/8004-ai/8004-solana) — referenced only by the retained experimental groundwork

## License

MIT
