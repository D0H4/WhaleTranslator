# Provider Base URL Change Design

## Goal

Point WhaleTranslator at the OpenAI-compatible provider whose base URL is
`http://100.115.209.7:4323/v1`, while continuing to use the
`deepseek-v4-flash` model.

Remove the `camelAI` provider name from application code, user-facing text,
documentation, and tests. The UI will identify the configured model without
displaying a provider brand.

## Scope

- Keep `http://100.115.209.7:4323/v1` as the provider base URL.
- Continue using the existing raw `fetch` client. Do not add an OpenAI SDK
  dependency.
- Build the actual request endpoint as
  `http://100.115.209.7:4323/v1/chat/completions`, matching the endpoint an
  OpenAI SDK would derive from the configured base URL.
- Keep the model set to `deepseek-v4-flash`.
- Keep Bearer-token authentication, request payload shape, SSE streaming,
  cancellation, and existing HTTP error mapping unchanged.
- Replace the manifest host permission with
  `http://100.115.209.7:4323/*` and remove the old camelAI host permission.
- Remove `camelAI` wording and camel-specific internal identifiers. Use
  provider-neutral code names; user-facing API sections display the model name
  where identification is useful.
- Update README guidance and privacy wording to name the destination endpoint
  without inventing a replacement provider brand.

## Architecture and Data Flow

The background service worker remains the only component that reads the stored
API key and contacts the provider. It calls a provider-neutral streaming client.
The client combines the `/v1` base URL with `/chat/completions`, sends the same
OpenAI-compatible JSON request, and passes SSE text deltas back through the
existing extension port.

No settings schema or storage migration is required. Existing saved API keys
and target-language settings remain intact.

## Error Handling

Existing status-to-error behavior remains unchanged. User-visible errors will
refer generically to the API or service instead of camelAI. Network failures,
authentication failures, rate limits, server errors, invalid responses, and
cancellation retain their current codes and control flow.

The new provider uses plain HTTP. The extension manifest will grant access only
to the specified host and port rather than requesting broad host permissions.

## Verification

- Update the streaming-client test to assert the `/v1/chat/completions` request
  URL, `deepseek-v4-flash` model, Bearer header, messages, and streaming flag.
- Update the manifest test to assert that only
  `http://100.115.209.7:4323/*` is granted as a provider host.
- Scan maintained source, tests, manifest, and README for remaining `camelAI`
  or camel-specific identifiers.
- Run `npm run check`, including lint, type checking, unit tests, production
  builds, and distribution verification.

## Out of Scope

- Making the provider base URL user-configurable.
- Adding or migrating to an OpenAI SDK.
- Changing the model, API-key storage, translation behavior, or UI layout.
