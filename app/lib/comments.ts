export const MIN_COMMENT_LENGTH = 1;
export const MAX_COMMENT_LENGTH = 5000;

export type CommentBodyResult =
  | { ok: true; trimmed: string }
  | { ok: false; error: string };

// The one definition of the comment body length rules. Used by createComment
// and by the lesson page's edit path.
export function validateCommentBody(body: string): CommentBodyResult {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    return { ok: false, error: "Comment cannot be empty" };
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, trimmed };
}
