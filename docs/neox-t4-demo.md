# Neo X T4 + NeoFS demo runbook

This runbook starts from a clean checkout of the AxLabs fork. The fork is not assumed to be published to npm.

## 1. Install and build the CLI

```bash
git clone https://github.com/AxLabs/agentory-cli.git
cd agentory-cli
npm ci
npm run build
```

## 2. Generate the demo project

Create `demo-agent.config.json` outside the repository or keep it secret-free:

```json
{
  "projectDir": "./demo-agent",
  "agentName": "Neo X Demo Agent",
  "agentDescription": "ERC-8004 agent registered on Neo X T4",
  "chain": "neox-t4",
  "features": [],
  "metadataStorage": "managed",
  "skipInstall": true
}
```

Generate and install:

```bash
node dist/index.js --config ./demo-agent.config.json --skip-install
cd demo-agent
npm install
```

## 3. Configure the signing key

Copy `.env.example` to `.env`. The file is gitignored. Prefer a key file when practical:

```env
PRIVATE_KEY_FILE=/absolute/path/to/gitignored-neox-t4-key
# Or use PRIVATE_KEY=0x...
```

Managed storage does not use a NeoFS account, container, gateway, or upload token. The signing key is used only for `register()` and `setAgentURI`. It is not sent to Agentory.

This demo targets Neo X T4 and the Agentory staging API. Set the origin explicitly; the generated project does not default to it:

```env
AGENTORY_API_BASE_URL=https://staging.agentory.xyz
```

The client posts the registration JSON to `POST /api/registration-metadata` on that origin and keeps the returned `neofs:<containerId>/<objectId>` value exactly. The chain is still selected by the RPC. A missing or invalid origin fails before minting and before a resumed upload.

## 4. Fund and preflight

Fund the signer with testnet GAS using the [Neo X T4 faucet](https://neoxfaucet.ngd.network/), then run:

```bash
npm run preflight
```

Preflight verifies chain ID `12227332`, the registry at `0x8004A856a396D08d31E597a867B1D8273901e641`, signer balance, contract reads, and the next transaction simulation. It never uploads or sends a transaction.

## 5. Register

```bash
npm run register
```

The command mints the identity with the user's wallet, builds registration metadata that includes that `agentId`, uploads it through Agentory, and calls `setAgentURI` only after the upload returns a canonical `neofs:` URI. Copy the printed transaction links and open them in the [Neo X T4 explorer](https://xt4scan.ngd.network).

If minting fails, no identity is saved. If upload fails, `.registration-state.json` keeps the minted `agentId` and `setAgentURI` is not sent. If `setAgentURI` fails after a successful upload, the same `containerId`, `objectId`, and `agentURI` are reused when the metadata is unchanged. A metadata change uploads a new object. Nothing is deleted or rolled back.

A reverted transaction is recovered by running `npm run register` again. If a pending transaction hash cannot be found, registration stops and leaves the hash in place instead of broadcasting a replacement; inspect it on the explorer before continuing.

## 6. Show the public metadata

Read `agentURI` from `registration-result.json`. It has the form `neofs:<containerId>/<objectId>`. Read it through the public NeoFS REST gateway for that network (mainnet example: `https://rest.fs.neo.org`):

```bash
curl --fail --show-error --header 'Accept: application/json' \
  "https://rest.fs.neo.org/v1/objects/<containerId>/by_id/<objectId>"
```

The response should be JSON and its `registrations` entry should contain:

```text
eip155:12227332:0x8004A856a396D08d31E597a867B1D8273901e641
```

with the minted `agentId`.

## 7. Verify and inspect logs

```bash
npm run verify
npm run logs
```

Verification checks `ownerOf`, `tokenURI`, `getAgentWallet`, public metadata retrieval, equality with the intended registration file, and the exact registration reference. The result and state files contain no signing key or bearer token.

If the AxLabs scanner/indexer supports generic HTTPS metadata URIs, optionally show the same agent there. Scanner changes are outside this repository.

## Compatibility paths

`metadataStorage` in `src/agent-config.ts` selects the backend. `"managed"` is the normal path. `"uri"` registers `metadataUri` unchanged and does not upload. `"inline"` and `"neofs"` remain for compatibility and are not wizard choices.

Direct NeoFS still requires an existing container and gateways:

```env
NEOFS_REST_GATEWAY=https://your-rest-gateway.example
NEOFS_CONTAINER_ID=your-existing-container-id
NEOFS_PUBLIC_GATEWAY=https://your-public-gateway.example
NEOFS_BEARER_TOKEN=
```

`NEOFS_REST_GATEWAY` uploads with `POST /v1/objects/{containerId}`. `NEOFS_PUBLIC_GATEWAY` must allow an unauthenticated HTTPS GET of `/v1/objects/{containerId}/by_id/{objectId}`. Never commit the bearer token or reuse the Neo X EVM key as a NeoFS credential.

For a project that has not yet completed registration, rerun `npm run preflight` and `npm run register` after changing `metadataStorage`. Do not delete `.registration-state.json`; it is what prevents duplicate minting.
