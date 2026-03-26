# Welcome to Citation Gecko!

[![Open Source Love](https://badges.frapsoft.com/os/v2/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)
[![MIT Licence](https://badges.frapsoft.com/os/mit/mit.svg?v=103)](https://opensource.org/licenses/mit-license.php)
[![DOI](https://zenodo.org/badge/167792602.svg)](https://zenodo.org/badge/latestdoi/167792602)

This is a tool that uses the citation relations between scientific papers to help researchers find interesting and relevant papers.

The user specifies several 'seed' papers which define the specific area of the scientific landscape they are interested in.

The tool then searches several databases to find the papers that cite or are cited-by the seed papers.

Papers that are cited by a lot of the seed papers are likely to be important foundational papers in the field (or certainly worth being aware of at least).

Papers that cite a lot of the seed papers are likely to be more recent papers in the same area that might be worth reading.

The tool allows the user to view these highly connected papers either in a table or in the context of the network.

## Live demo

[citationgecko.com](http://citationgecko.com)

## Running Citation Gecko locally

1. Clone the git repo:
   `git clone https://github.com/CitationGecko/gecko-react`
2. If you don't have it already install Node.js from https://nodejs.org/en/.
3. Install Yarn from https://yarnpkg.com/getting-started/install
4. Open a terminal and navigate to the repository folder.
5. Run `yarn` from the command line to install all the package dependencies.
6. Run `yarn run build` from the command line to build the app.
7. Run `yarn run start` to launch the server.
8. The application will be served to http://localhost:8000

## Unified search endpoint (/api/search)

`/api/search` is the unified backend entry for paper search.

### Search providers

- Default provider: `OpenAlex` (`SEARCH_PROVIDER=openalex`)
- Optional provider: `Semantic Scholar` (`SEARCH_PROVIDER=semantic`)
- Hybrid mode: `SEARCH_PROVIDER=hybrid` (query both providers, then dedupe + rank)

Provider behavior:

- `openalex`: query OpenAlex only.
- `semantic`: query Semantic Scholar first; if Semantic fails, fallback to OpenAlex.
- `hybrid`: query Semantic Scholar and OpenAlex in parallel; merge successful results and dedupe.

If `SEMANTIC_SCHOLAR_API_KEY` is not configured, `openalex` mode still works normally, and the project can start without Semantic key.

### Response format

`/api/search` keeps front-end compatible format:

```json
{
  "success": true,
  "data": [
    {
      "id": "openalex:W123",
      "title": "Paper title",
      "authors": ["A", "B"],
      "year": 2023,
      "doi": "10.xxxx/xxxx",
      "journal": "Nature",
      "source": "openalex"
    }
  ]
}
```

### Environment variables

Add in `.env`:

```bash
SEARCH_PROVIDER=openalex
SEARCH_RESULT_LIMIT=8
SEARCH_TIMEOUT_MS=10000
SEMANTIC_SCHOLAR_API_KEY=
```

### Local testing

After starting server (`yarn start`), test via:

- Keyword search: `http://localhost:8000/api/search?keyword=graph%20neural%20network`
- DOI search: `http://localhost:8000/api/search?keyword=10.1038/s41586-020-2649-2`

Run automated tests:

```bash
yarn test --watch=false --runInBand src/__tests__/searchService.test.js src/__tests__/searchRoute.integration.test.js src/__tests__/searchApi.test.js
```

### Current capability boundaries

- Current implementation is: real provider search + lightweight dedupe/ranking + multi-source compatibility.
- It is not a full reproduction of Connected Papers graph algorithm.
- Chinese query quality may vary due to upstream data source coverage and indexing.
- Semantic Scholar may still be rate-limited or unstable in some regions.
- `/api/openalex/search` and `/api/openalex/related` are auxiliary compatibility/debug routes; `/api/search` is the primary entry.

## Instructions for use

1. Go to [citationgecko.com](http://citationgecko.com) or [localhost:8000](http://localhost:8000) if you're running application locally
2. Add some seed papers by clicking 'Add more seeds' button in the left-hand panel.
3. There are several ways of choosing seed papers to start with:
   2. Upload a bibTex file (NOTE: currently only entries with a DOI will be added)
      - There is an example BibTex in the repository (public/examples/exampleBibTex.bib) which you can try importing as a test case.
   3. Search for seed papers
      - Main search endpoint is `/api/search`, backed by OpenAlex / Semantic Scholar (provider depends on `SEARCH_PROVIDER`).
      - CrossRef-related modules in this repo are legacy/auxiliary import capabilities, not the primary `/api/search` provider.
      - Choose which papers to add as seeds by clicking the Add buttons at the end of each row.
   4. Import from Zotero
      - This will redirect you to Zotero in order to authenticate the app allow you to add papers in your zotero collections.
4. The seed papers added are listed in the left-hand panel and connections between them shown graphically in the right hand panel.
5. For a list of the papers connected to these seed papers click the icon with 3 dots in the side bar.
6. You can switch between viewing a graph showing only references of the seed papers and a graph showing only the papers that cite the seed papers by clicking the toggle between 'Papers Cited-By Seed Papers' and 'Papers Citing Seed Papers' that also acts as a key.
7. If one of the connected papers seems highly relevant you can add it as a seed paper either from the list view or network view, expanding the network in order to uncover more papers.

## Citing CitationGecko

To cite CitationGecko use the following details:

Author: Barnabas James Walker

Title: CitationGecko

DOI: https://doi.org/10.5281/zenodo.7068284

An example format may be:

Walker. B (2022) CitationGecko [Software] https://doi.org/10.5281/zenodo.7068284
