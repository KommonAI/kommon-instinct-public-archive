---
name: files
description: Create and share documents, spreadsheets and notes. Use when the owner asks for a doc, a spreadsheet, a budget, a list, a letter, slides, a CSV, or to write something down. Plain markdown and CSV go straight into the workspace; Word, Excel and PowerPoint formats are made with LibreOffice on the desktop and saved to the workspace, then shared by path or as an attachment.
---

# Files

Two places to make things:

- The workspace (`workspace/` under the data directory, `/data/workspace` on
  Maritime). Use the `write`, `edit`, `read`, `ls` and `bash` tools. Good for
  markdown, CSV, JSON, plain text and small scripts.
- The desktop, when the owner needs a real office format (.docx, .xlsx, .pptx,
  .pdf) or wants to open it in Word or Excel later. LibreOffice Writer, Calc and
  Impress are installed. See skill `maritime-computer`.

Pick the simplest format that does the job. A packing list is a text message
or a markdown file, not a spreadsheet.

## Layout

```
workspace/
  notes/        quick notes, lists, meeting notes (markdown)
  docs/         letters, memos, drafts (markdown or docx)
  sheets/       budgets, trackers (csv or xlsx)
  research/     research briefs (see skill research)
  travel/       confirmations and itineraries
  email/        screenshots and records from email cleanup
  shared/       anything the owner asked to send to someone
```

Name files `yyyy-mm-dd-slug.ext`. Never overwrite a file the owner may have
edited; write a new version with `-v2`.

## Markdown and CSV

1. Draft the content. Keep headings plain and short.
2. `write` to the path. For CSV, quote fields with commas, use a header row,
   ISO dates.
3. `read` it back once if it is longer than a screen. Fix typos.
4. Share: `send_message` with a two-line summary and the path. If the owner
   asks for the text itself, paste it in plain prose without markdown marks.

## Office formats with LibreOffice

1. Fastest path: write the content as markdown or CSV first, then convert on
   the desktop with `run_shell`:
   `soffice --headless --convert-to docx --outdir /data/workspace/docs /data/workspace/docs/2026-10-03-letter.md`
   For spreadsheets convert a CSV to xlsx the same way. This avoids clicking.
2. If formatting matters (a letterhead, a slide layout), open LibreOffice from
   the panel Menu on the desktop, build the document with the screenshot, act,
   verify loop, and Save As into `/data/workspace/<folder>/`. Verify the saved
   file exists with `ls` or `run_shell ls`.
3. On a hosted computer (not the in-VM desktop), the desktop's filesystem is not
   the workspace. Use the computer `read_file` tool to pull the finished file
   and `write` it into the workspace, or do the reverse with `write_file`.

## Sharing

- To the owner: the path and a summary. When the server exposes a file link,
  include it; otherwise offer to text the content.
- To someone else: only when the owner asks. Email through the mail tool with
  the file attached when the tool supports it; otherwise paste the content.
  Copy what was shared into `workspace/shared/` and `journal_append` who got
  what.
- Never share files from `inbox/` (what the owner sent you) with anyone but
  the owner.

## Voice

Agent: Done. Your October budget is at workspace/sheets/2026-10-03-october-
budget.csv, 24 lines, income at the top, fixed costs, then variable. Totals
match the numbers you gave me, $4,180 in and $3,655 out. Want it as an Excel
file too?

Agent: The landlord letter is drafted at workspace/docs/2026-10-03-landlord-
heating.md. Three short paragraphs, firm but polite, asks for a repair date
within 7 days. Want me to read it to you or email it?

## Do not

- Do not write outside `workspace/`.
- Do not create files for a non-owner principal; `files.write` is owner only.
- Do not send a file to anyone the owner did not name.
