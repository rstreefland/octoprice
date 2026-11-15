# Tariff catalogue updates

`.github/workflows/update-tariff-catalogue.yml` runs every Monday at 06:23 UTC and
can also be run manually from GitHub Actions. It fetches Octopus Energy's public
product catalogue across current and historical domestic products, validates the
result with Zod, discovers the latest active and fallback tariffs for each supported
family, runs the test suite, and commits changed snapshots directly to `main`.

The updater only stages `public/data/tariff-catalogue.json` and
`public/data/tariff-sources.json`. It needs the workflow's standard
`GITHUB_TOKEN` with `contents: write` and `actions: write`; no API key or personal
token is needed. Both snapshot updaters share a concurrency group so their
commits cannot race each other. Branch protection must permit the workflow's data commits.

A bot push does not trigger the normal deployment workflow, so the updater
explicitly dispatches `pages.yml` on `main` after committing. That workflow runs
the tests, production build and typecheck before deploying. A scheduled run with
no changes does not commit or deploy. The retrieval timestamp is retained when
the catalogue is unchanged. A manual updater run dispatches deployment
even when data is unchanged, so it can recover a failed deployment dispatch.

## Data contract

- The updater queries the public Octopus Energy REST API for domestic products
  (`brand=OCTOPUS_ENERGY`, `is_business=false`, `is_prepay=false`).
- Both active products (`is_historical=false`) and historical archives
  (`is_historical=true`) are fetched and merged by product code.
- Supported domestic import families are Flexible (SVT), Tracker, Agile, Cosy,
  12-month Fixed, Flux, Intelligent Flux, Go, and Intelligent Go.
- Supported domestic export families are Agile Outgoing, Flux Export, Intelligent
  Flux Export, and standard Outgoing Fixed / Outgoing Lite Fixed.
- The catalogue requires at least one Flexible tariff (`variableCode`), at
  least one Agile plan, and at least one Tracker plan. If any required tariff or
  family is missing, discovery fails without updating stored files.
- Before writing, the updater checks that every previously stored import and
  export family and every historical Agile and Tracker plan remains available.
  A partial response fails validation and leaves the existing snapshot intact.
- Active products take precedence over withdrawn ones, followed by the latest
  archived version by `available_from`. Future products whose `available_from`
  is in the future are ignored.
- The browser app loads the committed snapshot from `/data/tariff-catalogue.json`
  via `TariffCatalogueProvider`, eliminating dozens of paginated API requests on
  initial page load. React Query caches the catalogue in the browser for an hour.
- `public/data/tariff-sources.json` records the snapshot retrieval timestamp, API
  endpoint, brand filter, and discovered counts for each category.

## Sources and licence

- [Octopus Energy REST API](https://api.octopus.energy/v1/products/)
- [Octopus Energy Developer Documentation](https://developer.octopus.energy/rest/overview)
- [GitHub workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

Tariff product definitions and names are published by Octopus Energy under their
public API terms.
