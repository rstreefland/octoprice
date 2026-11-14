# Price cap updates

`.github/workflows/update-price-caps.yml` runs every Monday at 06:17 UTC and
can also be run manually from GitHub Actions. It fetches UtilityPrices' regional
and GB-average datasets, validates them, merges the reported period into the
archive, runs the tests, and commits changed snapshots directly to `main`.

The updater only stages `public/data/price-caps.tsv` and
`public/data/price-cap-sources.json`. It needs the workflow's standard
`GITHUB_TOKEN` with `contents: write` and `actions: write`; no API key or personal
token is needed. Branch protection must permit the workflow's data commits.

A bot push does not trigger the normal deployment workflow, so the updater
explicitly dispatches `pages.yml` on `main` after committing. That workflow runs
the tests, production build and typecheck before deploying. A scheduled run with
no changes does not commit or deploy. A manual updater run dispatches deployment
even when data is unchanged, so it can recover a failed deployment dispatch.

## Data contract

- Both endpoints must report the same effective period and VAT basis, using
  Direct Debit and single-rate electricity, pence/kWh and pence/day.
- All 14 known regions must be present exactly once. The GB row comes from the
  published national average, rather than averaging regional figures.
- Missing or invalid rates, units, regions, licence metadata, or mismatched
  periods fail the job. Responses older than the stored archive are rejected.
- VAT-inclusive rates are copied as provided. The updater does not apply VAT or
  calculate new prices.
- Existing periods are retained. Corrections to the reported period replace its
  matching regional rows. Repeat imports produce the same files.

The original Octoprice TSV is retained as historical input, including blank
standing charges where they were unknown. UtilityPrices supplies the currently
published period, not a full historical API. Missing older periods are not
inferred by the updater. Future periods are accumulated as the updater observes
them.

The missing July to September 2026 period was backfilled once from Ofgem's
[final levelised cap rates model (Annex 9)](https://www.ofgem.gov.uk/sites/default/files/2026-05/Annex-9-Levelisation-allowance-methodology-and-levelised-cap-levels-v1.10-July-September-2026.xlsx).
Sheet `1a Levelised DTC`, rows 14 to 27, contains the Direct Debit (Other Payment
Method) regional charges. Columns C/D are the nil/benchmark single-rate
electricity charges; G/H are the nil/benchmark gas charges. These are annual
pounds excluding VAT. For this period, benchmark consumption is 2,500 kWh of
electricity and 9,500 kWh of gas, and both fuels carry 5% VAT.

- Unit rate in pence/kWh: `(benchmark - nil) * 1.05 * 100 / benchmark kWh`.
- Standing charge in pence/day: `nil * 1.05 * 100 / 365`.

The one-off conversion used decimal arithmetic and rounded half up to two
decimal places. GB averages were copied from
[Ofgem's July announcement](https://www.ofgem.gov.uk/news/changes-energy-price-cap-between-1-july-and-30-september-2026),
not calculated from rounded regional rates. This backfill is licensed under
the Open Government Licence v3.0 and recorded separately from UtilityPrices
updates. It does not add another scheduled data source.

`price-cap-sources.json` records each imported period, the provider's retrieval
date, VAT basis, Ofgem sources and required attribution. The live app fetches the
repo's TSV, so it does not depend on UtilityPrices being online for each visit.
The visible footer credits UtilityPrices and the original Ofgem source.
The updater preserves the one-off backfill and its provenance when new periods
are imported.

## Sources and licence

- [UtilityPrices API reference](https://utilityprices.co.uk/developers/api)
- [UtilityPrices attribution and reuse terms](https://utilityprices.co.uk/developers)
- [GitHub workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

Data: [UtilityPrices](https://utilityprices.co.uk/energy-price-cap), from Ofgem.
Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Contains public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
