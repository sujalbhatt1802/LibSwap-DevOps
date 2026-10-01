# US02 Catalogue Search - Manual Test Results

## Purpose

This document records manual testing completed for the US02 catalogue browsing and search feature.

## Test Cases

| Test | Action | Expected Result | Result |
|---|---|---|---|
| TC01 | Open `/catalogue.html` | All library books are displayed | Pass |
| TC02 | Search `fantasy` | Fantasy books are displayed | Pass |
| TC03 | Search `martin` | Clean Code is displayed | Pass |
| TC04 | Search using different letter casing | Search remains case-insensitive | Pass |
| TC05 | Search `xyz123` | `No books found.` is displayed | Pass |
| TC06 | Select Genre `Programming` | Only programming books are displayed | Pass |
| TC07 | Select Availability `Available` | Only available books are displayed | Pass |
| TC08 | Select Title A-Z | Books are sorted alphabetically by title | Pass |
| TC09 | Select Title Z-A | Books are sorted in reverse alphabetical order | Pass |
| TC10 | Select Author A-Z | Books are sorted alphabetically by author | Pass |
| TC11 | Use search and filters together | Only books matching the combined criteria are displayed | Pass |
| TC12 | Stop the server and search again | Old results are cleared and an error message is displayed | Pass |

## Error Handling Test

The backend server was stopped while the catalogue page remained open.

A new search was performed.

Expected message:

`Unable to load books. Please try again.`

The previous book results were cleared and the catalogue controls became available again after the failed request.

Result: Pass

## Overall Result

All tested US02 catalogue browsing, search, filtering, sorting and error-handling scenarios passed successfully.