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
  "metadataStorage": "neofs",
  "skipInstall": true
}
```

Generate and install:

```bash
node dist/index.js --config ./demo-agent.config.json --skip-install
cd demo-agent
npm install
```

## 3. Configure signing and NeoFS

Copy `.env.example` to `.env`. The file is gitignored. Prefer a key file when practical:

```env
PRIVATE_KEY_FILE=/absolute/path/to/gitignored-neox-t4-key
# Or use PRIVATE_KEY=0x...

NEOFS_REST_GATEWAY=https://your-rest-gateway.example
NEOFS_CONTAINER_ID=your-existing-container-id
NEOFS_PUBLIC_GATEWAY=https://your-public-gateway.example
NEOFS_BEARER_TOKEN=
```

`NEOFS_REST_GATEWAY` is the upload/control endpoint. `NEOFS_PUBLIC_GATEWAY` must allow an unauthenticated HTTPS GET of the uploaded object. Leave `NEOFS_BEARER_TOKEN` empty only for a public-write container; otherwise provide a container-authorized NeoFS bearer token. Never reuse the Neo X EVM private key as a NeoFS credential and never commit `.env`.

The CLI uses the current NeoFS REST gateway endpoints:

- upload: `POST /v1/objects/{containerId}`
- public read: `GET /v1/objects/{containerId}/by_id/{objectId}`

The container and gateway must already exist; this project does not provision NeoFS infrastructure.

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

The command mints the identity, uploads the exact registration metadata to NeoFS, reads it back from the public HTTPS URI, persists the secret-free publication record, and calls `setAgentURI`. Copy the printed transaction links and open them in the [Neo X T4 explorer](https://xt4scan.ngd.network).

If the process stops after minting or after upload, run the same command again. `.registration-state.json` keeps the existing `agentId`; registration does not mint a second identity.

A saved metadata publication is reused only when its canonical metadata, URI, and storage backend still match the current configuration. If the metadata or `metadataStorage` changed before registration completed, the retry publishes again with the current configuration and the same `agentId`. A reverted transaction is recovered by that same retry. If a pending transaction hash cannot be found, registration stops and leaves the hash in place instead of broadcasting a replacement; inspect it on the explorer before continuing.

## 6. Show the public metadata

Read `agentURI` and the NeoFS IDs from `registration-result.json`, then demonstrate public retrieval:

```bash
curl --fail --show-error --header 'Accept: application/json' '<agentURI>'
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

## Inline fallback

The generated `src/agent-config.ts` is the source of truth for the metadata backend. If NeoFS is unavailable during the demo, change:

```ts
metadataStorage: "neofs",
```

to:

```ts
metadataStorage: "inline",
```

For a project that has not yet completed registration, rerun `npm run preflight` and `npm run register`. The same mint/resume logic will publish a `data:application/json;base64,...` URI without NeoFS. Existing NeoFS environment variables may remain in `.env`; they are ignored when `metadataStorage` is `"inline"`. Do not delete `.registration-state.json`; it is what prevents duplicate minting.
