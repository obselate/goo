# Printing API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Printing`](https://github.com/obselate/goo/tree/main/Goo/Printing)

## `IPrintDocument`

Source:

- [`PrintDocument.gs`](https://github.com/obselate/goo/blob/main/Goo/Printing/PrintDocument.gs)

Supplies fresh page cells from a fixed document snapshot on the Goo owner thread.

### `CreatePage(int32,Printing.PrintPageSettings)`

Creates a full-paper page, including its margins. Index is zero-based and pages can be requested again.

### `Paginate(Printing.PrintPageSettings)`

Recomputes page breaks for paper settings. Page count must be positive on Ready.

## `PrintLayoutResult`

Source:

- [`PrintDocument.gs`](https://github.com/obselate/goo/blob/main/Goo/Printing/PrintDocument.gs)

Pagination Status, PageCount and optional Error detail for the chosen paper settings.

## `PrintLayoutStatus`

Source:

- [`PrintDocument.gs`](https://github.com/obselate/goo/blob/main/Goo/Printing/PrintDocument.gs)

Reports document pagination independently of export or spooler results.

### Values

- `Ready`
- `Cancelled`
- `Failed`

### `Cancelled`

The app cancelled pagination.

### `Failed`

The app could not paginate the document.

### `Ready`

The document can create the stated pages.

## `PrintPageSettings`

Source:
