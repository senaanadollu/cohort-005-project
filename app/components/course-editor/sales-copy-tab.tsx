import { Save } from "lucide-react";

import { MonacoMarkdownEditor } from "~/components/monaco-markdown-editor";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";

/**
 * The Sales Copy tab. The draft lives in the page, not here, so it survives
 * switching tabs.
 */
export function SalesCopyTab({
  salesCopy,
  onChange,
  onSave,
  hasChanges,
  isEmpty,
  isSaving,
}: {
  salesCopy: string;
  onChange: (value: string) => void;
  onSave: () => void;
  hasChanges: boolean;
  isEmpty: boolean;
  isSaving: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Sales Copy</h2>
        <p className="text-sm text-muted-foreground">
          Write the course sales copy in Markdown. This is shown on the public
          course page. Press Ctrl+S to format and save.
        </p>
      </CardHeader>
      <CardContent>
        <MonacoMarkdownEditor
          value={salesCopy}
          onChange={onChange}
          onSave={onSave}
        />
        <div className="mt-4 flex items-center gap-4">
          <Button
            onClick={onSave}
            disabled={!hasChanges || isEmpty || isSaving}
          >
            <Save className="mr-1.5 size-4" />
            {isSaving ? "Saving..." : "Save Sales Copy"}
          </Button>
          {isEmpty ? (
            <span className="text-sm text-destructive">
              Sales copy cannot be empty.
            </span>
          ) : (
            hasChanges && (
              <span className="text-sm text-muted-foreground">
                You have unsaved changes.
              </span>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
