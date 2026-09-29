# Solana Support Assessment

**Conclusion:** Solana is not currently a supported Agentory CLI target. The existing configuration-only Devnet implementation is intentionally retained as groundwork for potential future support, but it is not exposed through the interactive wizard and has not been validated end-to-end sufficiently to advertise as supported.

## Evidence of implementation

- The sole configured Solana network is `solana-devnet`, with a Devnet RPC URL, program ID, and x402 CAIP-2 identifier. [Source](../src/config-solana.ts#L1-L17)
- `--config` accepts `SolanaChainKey` values and recognizes `solana-devnet`; the CLI passes those answers through the ordinary project generator. [Config validation](../src/generate-from-config.ts#L7-L51) and [CLI dispatch](../src/index.ts#L161-L176)
- The generator routes that chain to dedicated Solana templates, producing a package manifest, environment file, registration metadata, registration script, agent, and generated README. [Source](../src/generator.ts#L47-L110)
- The generated registration script imports `8004-solana`, uploads metadata to IPFS through Pinata, initializes `SolanaSDK`, and calls `registerAgent`. [Generated-script template](../src/templates/solana.ts#L152-L269) The generated project declares `8004-solana`, `@solana/web3.js`, and `bs58`. [Generated package template](../src/templates/solana.ts#L16-L70)

## Evidence against a support claim

- The interactive chain selector lists only `CHAINS` (the EVM configuration); it never adds `SOLANA_CHAINS`. A normal interactive user therefore cannot select Solana. [Source](../src/wizard.ts#L124-L150)
- Before the support-status clarification, the README's advertised Devnet program ID differed from the ID used by runtime configuration: the README contained an extra `s` before `hyTREp`. The unsupported program-ID table has now been removed from the user-facing README. [Runtime configuration](../src/config-solana.ts#L6-L16)
- There are no Solana references or test suites under `tests/`. By contrast, the project has EVM chain test suites under `tests/chains/`. This leaves the configuration-only path, generated registration project, and generated dependencies without repository test coverage.
- The wizard marks x402 unavailable for a Solana answer because it looks only in `CHAINS`, while the A2A and package templates contain a Solana x402 branch that can be reached only through manually supplied config. [Wizard behavior](../src/wizard.ts#L179-L220), [A2A template](../src/templates/a2a.ts#L6-L71), and [generated dependency branch](../src/templates/solana.ts#L52-L56) This is an internally inconsistent, untested feature surface.
- The root CLI has Solana wallet-generation dependencies, confirming that the code is more than prose, but that does not make the inaccessible Devnet scaffold a supported product workflow. [Root manifest](../package.json#L46-L54) and [wallet generation](../src/wizard.ts#L294-L312)

## Resulting support status

The Solana implementation remains in the repository as explicitly unsupported groundwork for possible future support. It is not being removed, and accurate internal architectural references to its generator and templates remain useful.

User-facing documentation, CLI messaging, normal workflows, supported-chain listings, and package metadata must not claim that Solana is currently supported. The README may acknowledge the retained implementation only when it clearly labels it experimental, Devnet-only, configuration-only, unavailable through the interactive wizard, and not validated end-to-end.

Before reintroducing a support claim, add Solana to the interactive selector (or deliberately document config-only use), resolve the x402 availability mismatch, and add generation plus registration/integration coverage.
