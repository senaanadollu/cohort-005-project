import { data } from "react-router";
import {
  coursePermissions,
  type CourseRef,
} from "~/modules/permissions/course-permissions.server";
import { db } from "~/db";
import {
  createComment,
  deleteComment,
  editComment,
} from "~/lib/comments.server";
import { defaultNotifications } from "~/lib/notifications.server";
import { parseFormData } from "~/lib/validation";
import { getCommentById } from "./discussion";
import {
  createCommentSchema,
  deleteCommentSchema,
  editCommentSchema,
} from "./schemas";

type Person = Parameters<typeof coursePermissions.decide>[0];

export async function handleCommentIntent(
  intent: "create-comment" | "edit-comment" | "delete-comment",
  formData: FormData,
  person: NonNullable<Person>,
  ref: CourseRef,
  lessonId: number
) {
  const currentUserId = person.id;
  try {
    if (intent === "create-comment") {
      const parsed = parseFormData(formData, createCommentSchema);
      if (!parsed.success) {
        return { ok: false, error: "Enter a comment before posting." };
      }
      const created = await createComment(
        db,
        currentUserId,
        lessonId,
        parsed.data.parentId ?? null,
        parsed.data.body,
        new Date(),
        await defaultNotifications()
      );
      if (!created.ok) return created;
      return { ok: true };
    }

    if (intent === "edit-comment") {
      const parsed = parseFormData(formData, editCommentSchema);
      if (!parsed.success) {
        return { ok: false, error: "Enter a comment before saving." };
      }
      // Scope the id to this lesson so a comment elsewhere can't be reached
      // by posting its id to this route.
      const existing = getCommentById(parsed.data.commentId);
      if (!existing || existing.lessonId !== lessonId) {
        throw data("Comment not found", { status: 404 });
      }
      const edited = editComment(
        db,
        parsed.data.commentId,
        currentUserId,
        parsed.data.body,
        new Date()
      );
      if (!edited.ok) return edited;
      return { ok: true };
    }

    const parsed = parseFormData(formData, deleteCommentSchema);
    if (!parsed.success) {
      return { ok: false, error: "Could not delete that comment." };
    }
    const existing = getCommentById(parsed.data.commentId);
    if (!existing || existing.lessonId !== lessonId) {
      throw data("Comment not found", { status: 404 });
    }
    // Anyone who can view may delete their own posts; moderating someone
    // else's takes the manage capability.
    const decisions = coursePermissions.decide(person, ref);
    const canModerate = decisions.found && decisions.manage.allowed;
    const deleted = await deleteComment(
      db,
      parsed.data.commentId,
      currentUserId,
      canModerate,
      new Date(),
      await defaultNotifications()
    );
    if (!deleted.ok) return deleted;
    return { ok: true };
  } catch (error) {
    // Service validation failures are user-correctable; anything thrown as a
    // Response (404 above) should keep bubbling.
    if (error instanceof Error) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
