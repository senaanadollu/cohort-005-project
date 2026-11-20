import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./bookmarks-notes.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let otherStudent: typeof schema.users.$inferSelect;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  otherStudent = db
    .insert(schema.users)
    .values({
      name: "Other Student",
      email: "other@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

describe("toggling a Bookmark", () => {
  it("bookmarks a Lesson that has no Bookmark", () => {
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);

    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
  });

  it("removes the Bookmark when toggled again", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(false);

    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
    expect(listBookmarks(db, base.user.id)).toEqual([]);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
  });

  it("leaves another Student's Bookmark on the same Lesson alone", () => {
    toggleBookmark(db, otherStudent.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(isBookmarked(db, otherStudent.id, lessonIds[0])).toBe(true);
  });
});

describe("saving a Note", () => {
  it("creates the Note with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "  Remember the second example.  ",
      NOW
    );

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Remember the second example.",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thoughts.", NOW);
    const later = minutesAfter(30);

    saveNote(db, base.user.id, lessonIds[0], "Second thoughts.", later);

    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Second thoughts.",
      createdAt: NOW.toISOString(),
      updatedAt: later.toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("never leaves a Student with two Notes on one Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "Mine.", NOW);

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Again." })
        .run()
    ).toThrow();
  });

  it("keeps the body as the plain text that was typed", () => {
    const body = "# not a heading\n* not a bullet\n<b>not bold</b>";

    saveNote(db, base.user.id, lessonIds[0], body, NOW);

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });

  it("accepts a Note of exactly 2,000 characters", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW).ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toHaveLength(2000);
  });

  it("refuses a Note over 2,000 characters without saving any of it", () => {
    saveNote(db, base.user.id, lessonIds[0], "Already here.", NOW);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      minutesAfter(5)
    );

    expect(result).toEqual({
      ok: false,
      error: "A note can be at most 2,000 characters.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Already here.",
      updatedAt: NOW.toISOString(),
    });
  });

  it("refuses a Note that is only whitespace", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "   \n ", NOW)).toEqual({
      ok: false,
      error: "Write something before saving your note.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("gives another Student nothing to read", () => {
    saveNote(db, base.user.id, lessonIds[0], "Private.", NOW);

    expect(getNote(db, otherStudent.id, lessonIds[0])).toBeUndefined();
    expect(listNotes(db, otherStudent.id)).toEqual([]);
  });
});

describe("the Saved lists", () => {
  it("lists only the Student's own Bookmarks, newest first, with Lesson and Course", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[2], minutesAfter(10));
    toggleBookmark(db, base.user.id, lessonIds[1], minutesAfter(5));
    toggleBookmark(db, otherStudent.id, lessonIds[0], minutesAfter(20));

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      {
        lessonId: lessonIds[2],
        lessonTitle: "Lesson 3",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      },
      { lessonId: lessonIds[1], lessonTitle: "Lesson 2" },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1" },
    ]);
  });

  it("lists only the Student's own Notes, most recently edited first, with Lesson and Course", () => {
    saveNote(db, base.user.id, lessonIds[0], "Oldest, then edited.", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Middle.", minutesAfter(5));
    saveNote(db, base.user.id, lessonIds[0], "Edited last.", minutesAfter(10));
    saveNote(db, otherStudent.id, lessonIds[2], "Not yours.", minutesAfter(20));

    expect(listNotes(db, base.user.id)).toMatchObject([
      {
        lessonId: lessonIds[0],
        lessonTitle: "Lesson 1",
        body: "Edited last.",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      },
      { lessonId: lessonIds[1], body: "Middle." },
    ]);
    expect(listNotes(db, base.user.id)).toHaveLength(2);
  });
});
