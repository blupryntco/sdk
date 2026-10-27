---
"@bluprynt/sdk-client": minor
"@bluprynt/sdk": minor
---

Generate the API client from the public API's OpenAPI spec. `createClient({ apiKey })` now returns `lookupTokens`, `listChains`, `getChain` and `getBadge`, defaults `baseUrl` to `https://integrations.bluprynt.com`, sends the API key as-is in `Authorization`, and throws `ApiError` on a non-2xx response. `getCredential` is removed: the API has no such endpoint.
