# Production NeoFS for Agentory registration metadata

Research date: 2026-09-28

## Scope and status

This document combines two kinds of information:

- **Verified NeoFS facts** are findings from the production NeoFS research and retain their primary-source links.
- **Agentory architecture decisions** describe how Agentory will use those capabilities. They are product and system-design choices, not claims about NeoFS requirements.

### Verified NeoFS facts

The existing public NeoFS mainnet and its production REST service at `https://rest.fs.neo.org` support this use case. AxLabs does not need to operate a NeoFS network, storage node, `neofs-aio` deployment, or separate REST gateway.

The official [NeoFS Panel](https://panel.fs.neo.org/) is configured for NeoFS mainnet and `https://rest.fs.neo.org` in its [production configuration](https://raw.githubusercontent.com/nspcc-dev/panel-fs-neo-org/master/.env). NSPCC describes `neofs-rest-gw` as the primary third-party integration path in its [NeoFS project overview](https://github.com/nspcc-dev#neofs). There is no concrete technical requirement for AxLabs to self-host NeoFS infrastructure for Agentory metadata.

The supported production setup is an AxLabs-controlled Neo N3 mainnet account, an AxLabs-owned container that permits public reads and authenticated writes, and a short-lived container-scoped native NeoFS bearer token for uploads through the public REST service.

### Agentory architecture decisions

Managed metadata storage is the default when a user registers an agent through Agentory. Users should not normally need to understand or configure NeoFS, containers, gateways, bearer tokens, pinning, or storage infrastructure. A user may instead supply an existing URI and opt out of Agentory-managed storage.

Agentory will initially use one AxLabs/Agentory-owned NeoFS container for managed ERC-8004 registration metadata. Objects for different users and agents can coexist in that container. The container remains anonymously readable, while writes require Agentory-controlled credentials.

NeoFS credentials are server-side infrastructure credentials. The Agentory backend owns the container ID, bearer token, NeoFS write interaction, metadata validation, upload, and public read-back verification. The credentials are not distributed to CLI or web users.

For Agentory-managed metadata, the URI registered on-chain should use a stable Agentory-controlled public namespace rather than directly exposing a particular NeoFS REST gateway. NeoFS remains the durable storage layer; Agentory owns the stable HTTP namespace.

## Managed metadata flow

The target production flow is:

```text
Agentory CLI or web app
    -> build registration metadata
    -> ask the Agentory backend to validate and store it
    -> backend uploads to NeoFS and verifies public read-back
    -> receive the canonical Agentory metadata URI
    -> user wallet registers that URI in ERC-8004
```

The explicit alternative is:

```text
User supplies an existing URI
    -> skip Agentory-managed storage
    -> user wallet registers the supplied URI in ERC-8004
```

The CLI and web app use the same backend-managed storage capability. That capability may initially be a small backend module/API rather than a separately deployed storage service. Agentory needs no custody of the user's EVM private key: the user's wallet remains responsible for the ERC-8004 transaction.

## Production NeoFS setup

### 1. Creating an AxLabs/Agentory-owned container

Use the production [NeoFS Panel](https://panel.fs.neo.org/) with a dedicated AxLabs Neo N3 mainnet wallet. The official Panel supports depositing funds, creating and managing containers and objects, and configuring basic and extended ACLs ([Panel documentation](https://github.com/nspcc-dev/panel-fs-neo-org)).

Create the single Agentory-managed metadata container with:

- a normal production placement policy, such as the Panel's suggested/default policy;
- the extendable `eacl-public-read-write` basic ACL; and
- an initial extended ACL equivalent to the Panel's **allow reads for others** preset.

That preset allows `GET`, `HEAD`, and `RANGE` for `OTHERS`, while denying `PUT`, `DELETE`, and `SEARCH` for `OTHERS`. This combination is important: the basic ACL permits a bearer token to replace the eACL for an authorized request, while the stored eACL blocks unauthenticated writes.

Do not use `public-read-write` without a restrictive eACL. Do not use final `public-read` if uploads will use a native bearer token: a bearer token cannot relax a denial imposed by the basic ACL. The NeoFS [ACL specification](https://github.com/nspcc-dev/neofs-spec/blob/master/01-arch/07-acl.md) lists the canned ACL values and explains that eACL and bearer-token rules may only restrict permissions allowed by the basic ACL.

The official command-line alternative is `neofs-cli` against a public mainnet storage-node endpoint. NSPCC's [production Send.NeoFS example](https://github.com/nspcc-dev/send-fs-neo-org#deployment-to-production) uses `st1.storage.fs.neo.org:8080`, a Neo N3 wallet, a production placement policy, and an eACL that denies writes by others. The Panel is the simpler one-time provisioning path.

### 2. Wallet, account, and funding

Use a dedicated Neo N3 **mainnet** account owned by AxLabs. This is not the Neo X EVM registration signer and should not reuse that private key.

The account needs mainnet GAS for:

1. the Neo N3 transaction that deposits GAS into NeoFS;
2. the NeoFS container-creation charge; and
3. ongoing object storage.

Deposit GAS into the NeoFS balance through the Panel's **Deposit from mainnet to NeoFS** action before creating the container. The Panel reads current pricing from [`GET /v1/network-info`](https://rest.fs.neo.org/v1/network-info), so its displayed container cost is authoritative at setup time.

At the research date, the production endpoint reported:

```json
{
  "containerFee": 1000000000,
  "namedContainerFee": 200,
  "storagePrice": 100000,
  "withdrawalFee": 100000000,
  "epochDuration": 3600
}
```

The Panel's current calculation displays a named-container cost of approximately `0.0070000014 GAS`. That value is not a permanent protocol constant. Check the live Panel before depositing. Funding the wallet with roughly `1 GAS` gives ample operational headroom for the deposit transaction, one small container, and ERC-8004 JSON objects, but this is an operational recommendation rather than a minimum guaranteed by the protocol.

### 3. Public reads with controlled writes

Use this ACL model:

| Layer | Configuration | Result |
| --- | --- | --- |
| Basic ACL | `eacl-public-read-write` | Makes public reads and bearer-authorized writes representable. |
| Stored eACL | Allow `GET`, `HEAD`, `RANGE` for `OTHERS`; deny `PUT`, `DELETE`, `SEARCH` for `OTHERS` | Anonymous consumers can resolve ERC-8004 metadata, but cannot upload or mutate objects. |
| Upload credential | Native NeoFS bearer token allowing only `PUT`, kept secret and limited in lifetime | The Agentory backend can upload through the public gateway without exposing the owner key. |

The Panel's **allow reads for others** preset implements this eACL shape. Verify the created container through:

```text
GET https://rest.fs.neo.org/v1/containers/<container-id>
GET https://rest.fs.neo.org/v1/containers/<container-id>/eacl
```

The container owner wallet can remain offline during ordinary Agentory uploads. Only the scoped bearer token is placed in the Agentory backend's secret store. Anonymous consumers need neither Agentory nor NeoFS credentials to read managed metadata.

### 4. Supported upload authentication

The simplest supported authentication for the Agentory backend is a completed native NeoFS bearer token created through the production gateway's authentication-v2 endpoints:

1. `POST /v2/auth/bearer` to form an unsigned token.
2. Sign the returned `token` with the container-owner Neo N3 account.
3. `POST /v2/auth/bearer/complete` with the token, signature, public key or verification script, and signing scheme.
4. Send the completed token in the `NeoFS-Bearer-Token` request header.

The request used to form the token should be scoped to `PUT` and have a finite lifetime:

```json
{
  "issuer": "<AxLabs Neo N3 address>",
  "lifetime": 720,
  "records": [
    {
      "operation": "PUT",
      "action": "ALLOW",
      "filters": [],
      "targets": [{ "role": "OTHERS", "keys": [] }]
    }
  ]
}
```

`lifetime` is measured in NeoFS epochs. With the one-hour epoch observed at the research date, `720` is approximately 30 days. Choose a shorter lifetime when operationally practical and rotate the token before it expires. Omitting the lifetime uses the gateway default of 100 epochs.

The exact endpoint schemas and supported signing schemes are defined by the official [`neofs-rest-gw` OpenAPI specification](https://raw.githubusercontent.com/nspcc-dev/neofs-rest-gw/master/spec/rest.yaml). The [authentication-v2 migration guide](https://github.com/nspcc-dev/neofs-rest-gw/blob/master/docs/migration-to-auth-v2.md) distinguishes native bearer tokens from REST session tokens and specifies `NeoFS-Bearer-Token` for bearer-token object operations.

A completed v2 session token in `Authorization: Bearer ...` is also supported, but it must target a gateway account or NNS name. `rest.fs.neo.org` is load-balanced and `/v1/gateway` can return different gateway addresses; at the research date it returned no stable NNS target. A token bound to one sampled backend is therefore not a robust credential for the public hostname. A native bearer token is gateway-independent and is the safer production default.

### 5. Current direct CLI authentication

The current direct CLI-to-NeoFS implementation sends:

```http
Authorization: Bearer <NEOFS_BEARER_TOKEN>
```

Gateway source tries to decode a native bearer token from this header for backward compatibility and labels it an **old call** before attempting to parse the value as a v2 session token ([gateway authentication source](https://github.com/nspcc-dev/neofs-rest-gw/blob/master/handlers/api.go)). The current code may therefore work, but it relies on a compatibility path rather than the documented interface.

For the direct acceptance-test/infrastructure integration path, change `agentory-cli` to send:

```http
NeoFS-Bearer-Token: <NEOFS_BEARER_TOKEN>
```

The environment-variable name `NEOFS_BEARER_TOKEN` remains appropriate for that infrastructure path. `X-Bearer-Signature` and `X-Bearer-Signature-Key` are not needed when the supplied token is already completed and contains its signature.

If this path later supports v2 session tokens as a separate mode, expose them as `NEOFS_SESSION_TOKEN` and send them through `Authorization: Bearer ...`; do not overload the two token types.

This direct path is useful for the Neo X T4/NeoFS acceptance test, but it is not the intended production end-user architecture. Production CLI and web clients do not receive the Agentory container's NeoFS credential.

### 6. Gateway configuration and stable public URI

`https://rest.fs.neo.org` can be the default NeoFS REST upstream for the Agentory backend. The same production service implements authenticated `POST /v1/objects/{containerId}` and anonymous `GET /v1/objects/{containerId}/by_id/{objectId}`. The production Panel's configuration independently confirms that `rest.fs.neo.org` is the mainnet REST gateway, and the endpoint returned successful network and gateway metadata during this research.

At the NeoFS integration layer, both gateway values can default to the production service:

```dotenv
NEOFS_REST_GATEWAY=https://rest.fs.neo.org
NEOFS_PUBLIC_GATEWAY=https://rest.fs.neo.org
```

Keep both as infrastructure overrides for portability. In the target production architecture they are backend configuration, not end-user CLI or browser configuration.

The preferred long-term ERC-8004 `agentURI` for Agentory-managed metadata should instead use a stable Agentory-controlled namespace, conceptually:

```text
https://metadata.agentory.xyz/<objectId>
```

The exact hostname and path remain an implementation decision. The endpoint is a thin, public, read-only resolver:

```text
GET <Agentory-managed metadata URI>
    -> resolve the object ID in the configured Agentory NeoFS container
    -> fetch the object from the configured NeoFS public upstream
    -> return the metadata
```

Its initial upstream can be `https://rest.fs.neo.org`. This indirection lets Agentory change the resolver's NeoFS upstream later without requiring every agent owner to submit `setAgentURI()` solely because a gateway hostname changed. It does not require Agentory to operate a separate NeoFS REST gateway.

### 7. One-time setup and minimal runtime configuration

#### One-time setup

1. Create a dedicated AxLabs Neo N3 mainnet wallet and back it up according to AxLabs key-management policy.
2. Fund it with mainnet GAS. Approximately `1 GAS` is a conservative starting amount; confirm live costs in the Panel.
3. Open [panel.fs.neo.org](https://panel.fs.neo.org/), connect the wallet, and approve the mainnet connection.
4. Deposit GAS from the Neo N3 account into the wallet's NeoFS balance.
5. Create the single Agentory managed-metadata container using a production placement policy.
6. Keep the Panel's extendable `eacl-public-read-write` basic ACL.
7. Select the **allow reads for others** eACL preset so reads are public and writes by others are denied.
8. Sign the requested `CONTAINER_PUT` and `CONTAINER_SET_EACL` permissions and create the container.
9. Record the returned Base58 container ID.
10. Form a short-lived bearer token with `POST https://rest.fs.neo.org/v2/auth/bearer`, restricted to `PUT`.
11. Sign the returned token with the owner wallet and complete it with `POST https://rest.fs.neo.org/v2/auth/bearer/complete`.
12. Store only the completed bearer token in the backend deployment secret store. Do not place the token or the Neo N3 private key in generated agent projects, CLI user configuration, or browser code.
13. Upload a harmless JSON document using the backend's intended request shape, retrieve it anonymously by container and object ID, and verify its bytes and `Content-Type`.
14. Configure the public Agentory metadata resolver to use this container and the public NeoFS upstream, then verify the same object through the Agentory-controlled URI.

Token renewal is recurring credential maintenance, not container provisioning. Repeat steps 10–12 before the bearer token expires.

#### Minimal backend runtime configuration

```dotenv
NEOFS_CONTAINER_ID=<Agentory production container ID>
NEOFS_BEARER_TOKEN=<completed native NeoFS bearer token>
```

The effective infrastructure defaults are:

```dotenv
NEOFS_REST_GATEWAY=https://rest.fs.neo.org
NEOFS_PUBLIC_GATEWAY=https://rest.fs.neo.org
```

The backend also needs the configured base URL for the stable Agentory metadata namespace once its hostname and path are chosen. CLI and web users need no NeoFS runtime configuration. The direct CLI acceptance-test path may continue to use the four NeoFS environment variables until it is replaced or isolated as test tooling.

## Metadata updates and object lifecycle

NeoFS objects are immutable. Updating managed registration metadata creates a new object and then updates the ERC-8004 URI; it does not modify the existing object:

```text
Current metadata -> NeoFS object A
Updated metadata -> create NeoFS object B
ERC-8004 setAgentURI(...) -> stable Agentory URI for object B
```

The agent ID remains unchanged.

Agentory does not require deletion or tombstoning of superseded metadata objects at this stage. These JSON documents are expected to have negligible storage cost, and immutable historical versions may be useful for provenance. Garbage collection can be added later if scale or economics justify it; cleanup of an old object should not be coupled to the CLI or web update transaction.

An uploaded object that is never referenced on-chain is a separate orphan-object case. Agentory can reconcile such objects later by comparing backend upload records with indexed ERC-8004 state.

## Indexing requirements

For Agentory-managed metadata, the Agentory indexer should index:

- the current agent URI;
- URI changes emitted through `URIUpdated`;
- the corresponding NeoFS object ID when the URI belongs to the Agentory-managed namespace; and
- ideally, URI and object history.

Keeping URI/object history preserves the relationship between immutable NeoFS versions and on-chain updates without making historical-object cleanup part of the registration flow.

## Acceptance path versus target production architecture

### Current acceptance-test path

Direct `agentory-cli` -> NeoFS remains acceptable for proving the Neo X T4/NeoFS integration. The bearer-token type, `NeoFS-Bearer-Token` header correction, gateway defaults, ACL checks, authenticated upload, and anonymous read-back findings above remain relevant to that path and to the backend implementation.

This path uses infrastructure credentials and should not be presented as the normal production experience for Agentory users.

### Target production architecture

```text
Agentory CLI / web app
    -> Agentory managed-metadata backend capability
    -> production NeoFS through rest.fs.neo.org
    -> stable Agentory-controlled public metadata URI
```

The target architecture has these boundaries:

- NeoFS container and upload credentials stay server-side.
- CLI and web use the same managed-storage capability.
- Public metadata reads require no Agentory or NeoFS credentials.
- The user wallet signs the ERC-8004 registration or `setAgentURI()` transaction.
- Users can bypass managed storage by providing an external URI.
- Agentory does not need to operate a NeoFS network, storage node, `neofs-aio`, or separate NeoFS REST gateway.
