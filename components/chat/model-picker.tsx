"use client";

import { CheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  chatModels,
  modelDescription,
  modelLabel,
  providerLabels,
} from "@/lib/ai/models";

type ModelPickerProps = {
  value: string;
  onChange: (modelId: string) => void;
};

export function ModelPicker({ value, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => chatModels.find((m) => m.id === value) ?? chatModels[0],
    [value],
  );
  const providers = useMemo(
    () => Array.from(new Set(chatModels.map((m) => m.provider))),
    [],
  );

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <PromptInputButton>
          <ModelSelectorLogo provider={selected.provider} />
          <ModelSelectorName>{modelLabel(selected)}</ModelSelectorName>
        </PromptInputButton>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="sm:max-w-xl" title="Choose a model">
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {providers.map((provider) => (
            <ModelSelectorGroup
              heading={providerLabels[provider] ?? provider}
              key={provider}
            >
              {chatModels
                .filter((m) => m.provider === provider)
                .map((m) => (
                  <ModelSelectorItem
                    key={m.id}
                    onSelect={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    value={m.id}
                  >
                    <ModelSelectorLogo provider={m.provider} />
                    <ModelSelectorName className="flex-none overflow-visible whitespace-nowrap text-clip">
                      {m.name}
                    </ModelSelectorName>
                    <span className="ml-2 min-w-0 flex-1 truncate text-muted-foreground text-xs">
                      {modelDescription(m)}
                    </span>
                    {m.id === value ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : (
                      <div className="ml-auto size-4" />
                    )}
                  </ModelSelectorItem>
                ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
