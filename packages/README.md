# Shared packages

Stage 1 shared packages:

- `api-client`: generated OpenAPI types and the Dike client factory.
- `contracts`: versioned event/job contracts and foundation HTTP types.
- `config`: environment guards and bounded configuration helpers.
- `ui`: Urban Mint tokens and accessible foundation components.

REST types come from OpenAPI. `contracts` does not export NestJS DTOs or Mongoose schemas.
