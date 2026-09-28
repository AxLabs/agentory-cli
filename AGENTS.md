# agentory-cli

## Repository

This repository owns Agentory CLI, the AxLabs npm CLI for scaffolding ERC-8004 agent projects for EVM chains and Solana, with optional A2A, MCP, and x402 support. The AxLabs-specific path adds Neo X T4 registration through direct viem calls and supports inline or NeoFS-hosted registration metadata.

The TypeScript ESM CLI starts in `src/index.ts`. Interactive and JSON-configured runs produce the same `WizardAnswers` model through `src/wizard.ts` and `src/generate-from-config.ts`; `src/generator.ts` then routes to the generic EVM, Monad, Neo X, or Solana templates in `src/templates/`. Shared A2A and MCP generators are applied after chain-specific generation. `src/neox/` contains the Neo X library copied into generated Neo X projects, including preflight, resumable registration, metadata storage, verification, and state handling.

## Repository-Specific Constraints

- Use npm for this repository's install, test, build, and packaging workflow; keep `package-lock.json` consistent with `package.json`. The supported runtime is Node.js 18 or newer, while CI uses Node.js 20.
- Treat generated project contents as product behavior. Change generators and templates under `src/`, then run `npm run build`; `dist/` is tracked, is the CLI entry point, and is the only directory shipped by the npm package.
- Preserve the generator routing boundaries: ordinary EVM chains use the base templates, Monad and Neo X use direct contract-call templates, Solana uses its dedicated SDK templates, and A2A/MCP generation remains shared.
- Preserve the Neo X T4 safety invariants: preflight is read-only; writes require chain ID `12227332`; mainnet writes are refused; the configured registry is validated; retries reuse the minted agent ID and persisted transaction state instead of minting again; metadata is reused only when its canonical content, URI, and storage backend are current.
- Keep signing keys, NeoFS bearer tokens, and other secrets out of generated state and result files. Read `docs/neox-t4-demo.md` before changing the Neo X registration or NeoFS workflow, and keep that runbook aligned with user-visible behavior.
- Keep the default test suite fast and deterministic. Cross-chain suites under `tests/chains/` install generated-project dependencies and start services, and belong behind the explicit integration command. The Neo X gate intentionally includes generated-project installation and compilation.

## Development Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the repository dependencies from `package-lock.json`. |
| `npm run dev` | Run the TypeScript CLI directly with `tsx`. |
| `npm run build` | Type-check `src/` and compile JavaScript plus declarations into tracked `dist/`. |
| `npm start` | Run the compiled CLI from `dist/index.js`. |
| `npm test` | Run the fast deterministic Vitest suite used by normal CI. |
| `npm run test:watch` | Run the default suite in Vitest watch mode. |
| `npm run test:neox` | Run the four-file Neo X gate, including generated-project dependency installation and compilation. |
| `npm run test:integration` | Run the slow cross-chain suites in `tests/chains/`; paid x402 cases additionally require `TEST_PAYER_PRIVATE_KEY` and funded testnet wallets. |
| `npm run test:e2e` | Run the standalone generated A2A client/server end-to-end script; it installs a temporary generated project and starts a local server. |
| `npm pack --dry-run` | Inspect the npm package contents without publishing. |

<!-- BEGIN AXLABS MANAGED: repository-initialization-guidance -->
When the `AXLABS INITIALIZATION: INCOMPLETE` marker is present, follow `.axlabs/INITIALIZE.md` before normal work.
<!-- END AXLABS MANAGED: repository-initialization-guidance -->

<!-- BEGIN AXLABS MANAGED: durable-context-guidance -->
## Durable Context

Keep important engineering knowledge in Git and use this file as its concise entry point.

Before changing architecture, ownership, compatibility, or established product behavior, read relevant records in `docs/decisions/` and follow its README; record only durable decisions.

- Architecture documentation describes the current system.
- Runbooks describe recurring operational procedures.
- Release or deployment context records actions and compatibility concerns tied to delivery.
- For work that crosses repository boundaries, consult the authoritative project-context repository named in this file, when configured.
- Ordinary implementation changes usually require no durable documentation update.
<!-- END AXLABS MANAGED: durable-context-guidance -->

## Important Paths

- `src/config.ts` and `src/config-solana.ts`: supported networks, RPCs, x402 capabilities, and trust-model configuration.
- `src/templates/`: source of generated package files, servers, registration scripts, and per-chain README content.
- `src/neox/`: copied Neo X registration runtime; `src/templates/neox.ts` packages it into generated projects.
- `tests/*.test.ts`: fast configuration and mocked Neo X behavior, except the dependency-installing `tests/neox-t4.test.ts`.
- `tests/chains/` and `tests/utils/chain-test-factory.ts`: slow generated-project and service integration coverage across supported chains.
- `docs/neox-t4-demo.md`: operational runbook for the Neo X T4 and NeoFS demo flow.
- `docs/decisions/`: durable repository-specific architectural and behavioral decisions.
