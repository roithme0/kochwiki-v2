# Kochwiki

Kochwiki is a private, mobile-first recipe app. This next iteration builds on v1 and introduces AI-assisted recipe improvements, while serving as a practical project for professional AI and full-stack engineering.

## Core Features

- **Recipe and ingredient management**: Create and maintain recipes and ingredients manually, including images.
- **Nutrition tracking**: Track calories and macronutrients per ingredient and calculate them for each recipe from its ingredients and quantities.
- **Gut-health recipe improvements**: Use AI to assess recipes against transparent, non-medical gut-health criteria and propose reviewable improvements. Initial signals include fibre, ingredient diversity, fermented foods, and the degree of processing. Allergies, intolerances, and dietary exclusions take priority.
- **Mobile-first experience**: Use the application on a phone, including image capture or selection and cooking-friendly interactions. A Progressive Web App is the intended delivery model; desktop is secondary for now.

## Planned Architecture

- **Frontend**: Angular, built mobile-first as an installable PWA.
- **Backend**: A single Python FastAPI service.
- **Database**: PostgreSQL for recipes, ingredients, nutrition data, and image metadata.
- **Image storage**: Self-managed SeaweedFS, accessed through its S3-compatible API. Images are stored as objects; PostgreSQL stores metadata and object references.
- **Image access**: Private buckets with short-lived presigned upload and download URLs issued by the backend.

## AI and API Direction

AI suggestions must be explainable and individually reviewable. Accepted changes should preserve the original recipe or otherwise provide a clear history.

The project may later expose a constrained API for general-purpose agents. This will be treated as a security boundary: capabilities, authentication, authorization, and auditability must be designed before agent write access is introduced.

## Operational Notes

The initial service layout intentionally stays small: FastAPI, PostgreSQL, and SeaweedFS. A single SeaweedFS node is a single point of failure, so backups for both database and object storage are required from the outset. Replication and additional services will be added only when they address a concrete need.

## Scope

Kochwiki is for personal, private use. It is also a learning environment for applying production-minded AI and full-stack practices.

## AI Workflows

An authenticated `/chat-ui-demo` route demonstrates the static chat UI banner and a Kochwiki-owned renderer. Until the first `@roithme0/chat-ui` GitHub Packages release is available, its package remains installed from the original versioned tarball in `frontend/vendor`. The central theme mapping is in `frontend/src/styles/chat-ui-integration.scss`. After the registry migration, `npm run link:chat-ui` will replace the installed package with a direct link to the sibling AI Service build for interactive development; Docker and CI will continue to install the declared registry version.

Use workflow skills only when explicitly invoked by the user.

- `$prepare-spec`: pressure-test a scoped change and create or refine its lightweight spec.
- `$deliver-spec`: plan and implement an approved spec continuously, pausing only for material exceptions.
- `$review-delivery`: perform the final spec-conformance, validation, and broader codebase review.
