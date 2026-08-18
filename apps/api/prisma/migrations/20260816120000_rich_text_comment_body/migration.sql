-- Migrate Comment.body from plain-text (TEXT) to ProseMirror JSON (JSONB).
-- Direct column type change would fail because existing rows are plain
-- strings, not valid JSON. Two-column swap with a backfill in between:
--
--   1. Add nullable body_json JSONB.
--   2. Backfill: wrap each plain-text body as a single-paragraph ProseMirror
--      doc so the new rich-text editor can round-trip it.
--   3. Enforce NOT NULL now that every row has a value.
--   4. Drop the old body column, rename body_json → body.
--
-- Prisma wraps each migration file in a transaction by default, so a
-- failure at any step rolls back cleanly and leaves the table intact.

ALTER TABLE "comments" ADD COLUMN "body_json" JSONB;

-- Backfill: convert each plain-text row into a ProseMirror doc.
-- Empty strings become an empty paragraph (no text node) because
-- ProseMirror rejects text nodes with empty content.
UPDATE "comments"
SET "body_json" = CASE
  WHEN COALESCE("body", '') = '' THEN
    jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(
        jsonb_build_object('type', 'paragraph')
      )
    )
  ELSE
    jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', "body")
          )
        )
      )
    )
END;

ALTER TABLE "comments" ALTER COLUMN "body_json" SET NOT NULL;

ALTER TABLE "comments" DROP COLUMN "body";
ALTER TABLE "comments" RENAME COLUMN "body_json" TO "body";
