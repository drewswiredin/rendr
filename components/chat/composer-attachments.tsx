"use client";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  PromptInputSubmit,
  type PromptInputSubmitProps,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";

// The strip of pending attachments above the textarea (drop, paste, or pick):
// square tiles big enough to recognise an image, the remove button on the
// tile's corner on hover, and the file name on anything that isn't a picture.
export function ComposerAttachments() {
  const { files, remove } = usePromptInputAttachments();
  if (files.length === 0) {
    return null;
  }
  return (
    <Attachments className="ml-0" variant="grid">
      {files.map((file) => (
        <Attachment
          className="size-28 border"
          data={file}
          key={file.id}
          onRemove={() => remove(file.id)}
          title={file.filename}
        >
          <AttachmentPreview />
          {file.mediaType?.startsWith("image/") ? null : (
            <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-2 py-1 text-xs backdrop-blur-sm">
              {file.filename ?? "attachment"}
            </span>
          )}
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}

// The send button: enabled by text or by an attachment, and always while a
// reply is in flight (it then stops the reply).
export function ComposerSubmit({
  hasText,
  busy,
  ...props
}: PromptInputSubmitProps & { hasText: boolean; busy: boolean }) {
  const { files } = usePromptInputAttachments();
  return (
    <PromptInputSubmit
      disabled={!(hasText || files.length > 0 || busy)}
      {...props}
    />
  );
}
