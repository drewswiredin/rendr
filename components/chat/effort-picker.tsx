"use client";

import { CheckIcon } from "lucide-react";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type ChatModel,
  type EffortChoice,
  effortLabels,
} from "@/lib/ai/models";

// How hard the model thinks before it answers, for the models that take a
// reasoning level. "Auto" sends nothing and leaves the backend's default.
type EffortPickerProps = {
  model: ChatModel;
  value: EffortChoice;
  onChange: (effort: EffortChoice) => void;
};

export function EffortPicker({ model, value, onChange }: EffortPickerProps) {
  if (model.efforts.length === 0) {
    return null;
  }
  const choices: EffortChoice[] = ["auto", ...model.efforts];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton>
          <span className="text-muted-foreground">Effort</span>
          {effortLabels[value]}
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {choices.map((choice) => (
          <DropdownMenuItem key={choice} onSelect={() => onChange(choice)}>
            {effortLabels[choice]}
            {choice === value ? (
              <CheckIcon className="ml-auto size-4" />
            ) : (
              <div className="ml-auto size-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
