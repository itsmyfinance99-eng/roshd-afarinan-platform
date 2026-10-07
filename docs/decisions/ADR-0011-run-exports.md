# ADR-0011: Exports of a calculation run (xlsx, PDF, HTML)

- Status: Accepted
- Date: 2026-10-04

## Context

The owner requires every schedule of a calculation run as xlsx, PDF and standalone HTML, in COMFAR's order and structure, right to left with Persian digits, and with the same figures in all three (ST-34.09, comfar-model-spec §5). The result pages of the site (ST-34.08) already show part of the schedules from the stored run. ADR-0010 needs a Persian PDF for the feasibility report later and left the renderer open: "a headless renderer or a PDF library; chosen by measured image size and Persian shaping quality".

Forces:

- The page and the three files must not drift apart: one definition of the lines of every schedule and one place where a number is rounded.
- A stored run is immutable and may be older than the code that reads it.
- Names in a model are free text of the user: they must never become markup or a formula.
- The API image is small and has no browser; the API must stay responsive while a file is written.

## Decision

1. **A shared package `@roshd/financial-report`** (pure TypeScript, depends on the engine and on `@roshd/validation`) holds the tables of a run (moved from the web app), the tables of the input schedules and of the inputs, and `runReport`, which turns a stored run into a **report document**: parts in COMFAR's order, each made of blocks (period table, name–value list, grid, list, text). Every value is formatted there once and carries its number as a canonical decimal string. The result pages import the tables through sub-paths; the three files are written from the document.
2. **Nothing is recalculated.** The document is read from the run's stored input, results, warnings and defaults. A part whose stored data has another shape becomes a plain message; the other parts stay.
3. **HTML** is one file: inline CSS, the font embedded as WOFF2, no script, a `Content-Security-Policy` meta tag that allows nothing but inline style and the embedded font, every text escaped. The API also sends it as an attachment with a `sandbox` policy.
4. **xlsx is written directly as SpreadsheetML** and zipped with `fflate`: one right-to-left sheet per part, numbers as numeric cells whose format shows exactly the figure of the document (Persian digits through the number format), every text an inline string that is never a formula, and `quotePrefix` on texts that start like one. A value with more digits than a double keeps is written as text.
5. **PDF is laid out in code and drawn with PDFKit**, with the self-hosted Vazirmatn font (SIL OFL, in the package) embedded. PDFKit (fontkit) shapes Arabic-script letters; the order of a line comes from the Unicode bidirectional algorithm (`bidi-js`) in `render/pdf-text.ts`, which hands PDFKit one word, number or mark at a time. Wide tables continue in further parts, long tables repeat their heading.
6. **Files are written in a worker thread** behind the `RunReportRenderer` port (`WorkerRunReportRenderer`): one at a time per API process, at most four in the queue with the one being written, 30 seconds of work and 512 MB per file — the same pattern as the calculation itself. A user has one file in the making at a time and ten per minute; every download is in the audit log; access is that of the model (404 for everyone else).

## Consequences

- The page, the xlsx, the PDF and the HTML show the same lines and the same rounded figures; a new line of a schedule is added in one place.
- The API image grows by PDFKit and its font library (about 18 MB unpacked) and by four font files (about 350 kB); no browser and no system fonts are needed. ADR-0010's deliverable PDF can reuse the text layer and the layout code. It does since ST-35.13: the report of a study is written by the same writer, which lays a page upright or on its side (ADR-0010, «As built in ST-35.13»).
- The PDF layout is our own code: tables, page breaks and bidirectional text are covered by tests and were checked by eye, but a new kind of block needs layout work. Characters outside the font (other scripts, emoji) are drawn as missing glyphs.
- The xlsx writer supports exactly what the report needs. It was checked by opening the file in Excel; it is not a general spreadsheet library.
- The queue and the per-user limits live in the memory of each API process, like those of the calculation.

## Alternatives considered

- **A headless browser in the API (print the HTML to PDF).** Best typography for free, but several hundred megabytes in the image, a large attack surface next to user data and a process to supervise. Rejected for the size and the operations; the HTML export prints well from the reader's own browser.
- **A spreadsheet library (exceljs and similar).** Brings a reader for untrusted files and a long dependency tree for a writer of plain tables. Rejected; the format we need is small.
- **Rendering in the web app (Next.js route or the browser).** The files must be the same for every caller and must be audited and limited on the server; the browser cannot embed fonts into a PDF reliably. Rejected.
- **Separate builders per format.** Three places to keep in step with the page; figures could differ by rounding. Rejected in favour of one document.
- **Writing the files on the request thread.** A PDF of a large model takes seconds of CPU and would hold up every other request. Rejected.
