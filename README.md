# Octoprice - User-friendly Dashboard for Octopus Energy Users

![Octoprice App](https://github.com/edward-designer/dataviz/assets/25171685/88870a9b-54f0-4e86-a4fb-fa811a136926)

## Why Octoprice

I am a happy Octopus Energy user, but:

- it is not easy to get the energy rates from Octopus app or website
- some 3rd party websites are not user-friendly / visually pleasant
- there is no fast and convenient way to see how much I have saved or whether I will be better off with alternative tariffs

That's why I decided to create the Octoprice App.

## Features

- visualize the energy consumption pattern in the past year

  ![octopast](https://github.com/edward-designer/dataviz/assets/25171685/d0204b4e-86cc-49ca-8af1-891cc4cb3f17)

- get the latest unit rates details for different intelligent tariffs (in pratical the half-hourly rates for Agile) with sensible comparisions for informed decision / choice
- get historical and geographical unit rates

  ![tracker](https://github.com/edward-designer/dataviz/assets/25171685/a41afe20-54f9-40f4-b480-6052ce09c8c1)
  ![agile](https://github.com/edward-designer/dataviz/assets/25171685/68b2614a-5ebc-41ee-a847-2ab50d0e7f16)

- calculate and visualize how much I have saved using the current tariff

  ![savings](https://github.com/edward-designer/dataviz/assets/25171685/de66259a-41a4-430a-811b-a985448f5038)

- compare different tariffs based on actual annual energy consumption

  ![compare](https://github.com/edward-designer/dataviz/assets/25171685/921f61b9-a5d8-4305-9bed-db87f46eb2e2)

- dynamically generated images of amount of money saved for sharing to social media
- display results in an user-friendly and intuitive way, even on mobile screens

## Tech Stacks

- NextJS
  - a framework for both frontend and backend api development
  - SSR for faster response
  - SEO for different pages (meta/open graph/image)
- Typescript - for static type-checking to reduce bugs during development
- TailwindCSS - fast styling and better CSS rendering performance
- D3 - for data visualization
- Figma - for [logo and UI design](https://www.figma.com/file/fRlu7OsCH1vubhSukEXJWD/Octoprice?type=design&node-id=0%3A1&mode=design&t=ECSUyyVG1180wBPf-1)
- CI/CD for automated testing/linting/prettier/type checking using github actions
- Spline for 3d modelling and rendering

## Todo

- improve accessibility
- turn into a real iOS/Andriod app with system notifications and widgets

## Deployment

The site is hosted at https://octoprice.streefland.co.uk using GitHub Pages.
Pushes to `main` and manual runs of `.github/workflows/pages.yml` build a Next.js
static export and deploy the `out` directory using the official GitHub Pages
actions, matching `saving-session-explorer`.

Use the pnpm version declared in `package.json`:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm exec tsc --noEmit
```

Demo consumption is generated locally from deterministic synthetic values. It does
not represent a real household. Real account data is fetched directly from the
Octopus API in the browser. No server routes or private deployment API keys are
required.

## Tariff discovery

Tariff pages and comparison tools fetch the public Octopus product catalogue in
the browser, including paginated historical products. React Query shares the
catalogue across the app and caches it for an hour. No API key or scheduled build
is needed to discover a new product version.

The supported domestic families are Flexible (including Economy 7), Tracker,
Agile, Cosy, standard 12-month Fixed, Flux, Intelligent Flux, Go, Intelligent Go,
and the existing export families. Business, prepay, other suppliers and new smart
variants with unsupported pricing structures are excluded. Existing Bulb variants
remain recognised for compatibility. The latest open product is preferred,
falling back to the latest archived version when a family has been withdrawn.
Saved customer selections and historical Agile/Tracker versions remain available.

Ofgem cap data and the existing Agile/Tracker maximum-rate guarantees are unchanged.
`pnpm test` includes catalogue regression fixtures captured from the previous
hardcoded lists and public Octopus responses. The old Intelligent Flux export code
returns 404, so an unavailable family is handled without inventing a product code.
