"use client";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";

// The strip of pending attachments above the textarea (drop, paste, or pick).
export function ComposerAttachments() {
  const { files, remove } = usePromptInputAttachments();
  if (files.length === 0) {
    return null;
  }
  return (
    <Attachments variant="inline">
      {files.map((file) => (
        <Attachment data={file} key={file.id} onRemove={() => remove(file.id)}>
          <AttachmentPreview />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}
