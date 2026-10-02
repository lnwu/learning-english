"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { useAiModel, useLocale, toast } from "@/hooks";
import { SettingRow } from "./SettingRow";

export const ProfileAiModelRow = () => {
  const { aiModel, setAiModel, models } = useAiModel();
  const { t } = useLocale();

  const current = models.find((model) => model.id === aiModel);
  const providers = Array.from(new Set(models.map((model) => model.provider)));

  const handleChange = (value: string) => {
    setAiModel(value).catch((error) => {
      console.error("Failed to save AI model preference:", error);
      toast({ title: t("profile.aiModelSaveFailed"), variant: "destructive" });
    });
  };

  return (
    <SettingRow title={t("profile.aiModel")} description={t("profile.aiModelDesc")}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" disabled={models.length === 0} />}>
          {current ? current.label : aiModel}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {providers.map((provider, index) => {
            const group = models.filter((model) => model.provider === provider);
            return (
              <div key={provider}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{group[0]?.providerName}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={aiModel} onValueChange={handleChange}>
                    {group.map((model) => (
                      <DropdownMenuRadioItem key={model.id} value={model.id}>
                        {model.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SettingRow>
  );
};
