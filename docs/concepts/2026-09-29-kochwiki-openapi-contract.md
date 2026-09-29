# Kochwiki OpenAPI Contract Generation

## Status

Draft under discussion. Agreed scope: every Kochwiki-owned FastAPI endpoint, including routes Angular does not currently call and the recipe-presentation resolver used by AI Service. Every Kochwiki JSON response consumed by Angular receives generated runtime validation. Fixed response objects reject undocumented fields, assuming coordinated backend and frontend rollout. The AI Service's conversation API contract concept is the baseline for the contract strategy, not an implementation dependency. FastAPI's default 422 shape is restored, domain 404/409 errors use `detail` and are declared in OpenAPI, `/meta/version` declares its plain-text response, and delete routes declare bodyless 204 responses. Generation and Angular validation remain proposed work.

## Context

Kochwiki's FastAPI routes already declare Pydantic request models and response models for recipes, foodstuffs, users, and the recipe-presentation resolver. FastAPI serves OpenAPI at `/api/openapi.json`. Angular calls Kochwiki through `/api` with `HttpClient`, but its request and response interfaces are handwritten. The resolver is also called by the separately deployed AI Service; the browser's `/ai/api/v1` conversation route is a relay to that service, not a Kochwiki backend API.

The AI Service concept establishes a useful pattern: backend models define the HTTP contract; the exported OpenAPI document drives checked-in TypeScript types and runtime validators; the transport validates received JSON while retaining its existing request and error behavior. Kochwiki has a different transport and audience, so that pattern needs adaptation rather than direct copying.

## Problem

Handwritten Angular interfaces can drift from FastAPI's wire shapes. `HttpClient.get<T>()` asserts a type without validating the received body. Request types also drift: Angular's foodstuff create/update methods accept `Partial<Foodstuff>` even though the backend uses separate create and update schemas. The foodstuff delete method previously promised a numeric response although the route returns 204 with no body; it now returns `Promise<void>`.

Kochwiki now uses FastAPI's default request-validation response, `{ detail: [validation issues] }`, and returns domain 404/409 errors as `{ detail: string }`. Applicable domain errors are declared per route in OpenAPI. The HTTP status is carried by the response status line. FastAPI's generated validation-issue schema permits optional `input` and `ctx` and additional fields, so error validators must not impose the strict fixed-object policy used for Kochwiki-owned success DTOs. The plain-text version endpoint and bodyless 204 responses still need to survive generation with their actual media types and semantics.

## Proposed Direction

Treat Kochwiki's FastAPI models and route declarations as the source of truth for all Kochwiki-owned HTTP endpoints. Cover Angular-used routes, the recipe-presentation resolver consumed by AI Service, and currently unused routes such as recipe history, ingredient and step lists, and user mutations. Keep the AI Service conversation contract owned and generated in the AI Service repository; Kochwiki should use the published chat UI transport for that boundary rather than generate a second client from the relayed paths.

Make OpenAPI describe actual successful and expected failed responses before relying on generated output. Preserve FastAPI response validation on JSON success paths and its default 422 behavior. Model and validate domain error bodies sent through direct `JSONResponse`. Keep 204 responses bodyless and `/meta/version` as text. Check concrete route behavior against the exported document, especially recipe decimals, nullable values, and resolver responses.

Generate checked-in TypeScript request and response types from a reproducible `app.openapi()` export so Angular builds do not depend on a running backend. Replace handwritten wire interfaces at the backend service boundary, while keeping UI-only view models and mapping functions where they express actual presentation needs. Add a generation drift check to release/CI once the contract is accurate. The AI Service's pinned Hey API generator is the leading candidate, subject to a Kochwiki-specific trial of its output.

Use generated runtime validators for every Kochwiki JSON response consumed by Angular, after verifying they preserve the existing numeric, nullable, and nested recipe shapes. Reject undocumented fields on fixed response objects rather than silently stripping them. Allow dynamic keys only where the OpenAPI schema explicitly models a map, such as foodstuff metadata choices. Validate before data reaches recipe editing, proposal mapping, and draft saving. Keep Angular `HttpClient` and the existing service methods; generating a full HTTP client is not needed to eliminate duplicate models and unchecked responses. Classify malformed success bodies separately from HTTP failures without weakening the current 404/422 handling. The exact validator integration and UI error behavior remain to be decided. The plain-text version endpoint and bodyless 204 responses do not pass through JSON validators.

## Contract Boundaries

- Kochwiki owns recipe, foodstuff, user, metadata, and recipe-presentation resolver shapes. The AI Service owns session, message, turn, and proposal-envelope shapes. The Nginx and Angular relays do not create a new contract source.
- The resolver is a service-to-service contract and deserves explicit coverage even if Angular does not call it directly. Its request and enriched response must agree with AI Service's expectations; generated Angular types alone cannot establish that.
- Backend and Angular changes in this repository roll out together. Strict response validation assumes neither side will serve an incompatible version during deployment. The resolver has a separate deployer and may need coordinated rollout when its wire shape changes.
- HTTP DTOs and UI domain models may differ. Generated types should replace duplicate wire definitions, not force backend-specific names and optionality through every component.
- Runtime validation checks JSON shape; it does not prove business rules, authorization, or that an AI proposal is safe to save. Proposal artifact validation remains at the AI Service boundary and Kochwiki's proposal-to-draft mapping.

## Alternatives Considered

- **Keep handwritten models and add contract tests:** small tooling cost, but dual definitions and unchecked HTTP responses remain.
- **Generate TypeScript types only:** catches compile-time drift but leaves runtime JSON unchecked. This may be a useful first delivery slice, not the complete direction.
- **Generate a full client:** would replace established Angular services and complicate their change notifications and error handling without a clear contract benefit.
- **Generate types and validators:** matches the AI Service baseline and addresses both drift and runtime shape checks, at the cost of generator workflow and browser dependency weight.

## Integration Impact

FastAPI now owns the 422 response body and OpenAPI schema. Kochwiki's domain error handler validates its shared `{ detail: string }` model, and routes declare applicable 404/409 responses. The foodstuff delete service represents its bodyless 204 as `void`. Contract tests cover `/meta/version` as `text/plain`, all delete routes as bodyless 204, and representative decimal and resolver JSON against OpenAPI response schemas. Generated output still needs a trial to confirm those shapes survive generation.

The Angular service boundary is the natural place to consume generated types and validators. The complete backend contract should be generated even for routes Angular does not currently call; runtime validation applies wherever Angular actually consumes Kochwiki JSON. Foodstuff create/update inputs should follow the backend's distinct models, and delete methods should represent 204 as `void`. Recipe and presentation consumers can retain narrow adapters where a UI-only shape is useful. Generation and drift checks would touch build or tooling configuration during implementation and require the repository's separate confirmation gate.

The AI Service calls Kochwiki's resolver through its configured `KOCHWIKI_BASE_URL`; its conversation package's generated contract covers `/ai/api/v1` after relay. Cross-repository contract verification should include a representative resolver request and response, rather than treating each OpenAPI document as proof of compatibility.

## Open Questions

- How should Angular present a malformed successful response, distinct from a 404, a 422, or a network failure?
- What cross-repository check and deployment coordination should protect the AI Service resolver consumer when Kochwiki's contract changes?

## Risks

- Generated output can faithfully reproduce inaccurate OpenAPI. Route behavior and schema need contract-level checks before generation becomes a gate.
- Adding validators to every response increases browser code. Strict fixed-object validation also makes an additive backend field a runtime error until the frontend contract is updated and deployed with it.
- Strictly generated DTOs may expose existing request-type shortcuts and UI assumptions, requiring focused adapters rather than a wide refactor.

## Summary

Use Kochwiki's FastAPI OpenAPI document as the authoritative Kochwiki HTTP contract, correct its known gaps, and derive Angular wire types and runtime checks from it. Keep the AI Service conversation contract in its own repository and verify the shared resolver boundary across the two services.
