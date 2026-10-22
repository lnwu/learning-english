"use client";

import {
  Button,
  ButtonLink,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/ui";
import { AddWordDialog } from "@/components/word-picker";
import { useRef, useState } from "react";
import { useAddableWordCheck, useFirestoreWords, useLocale } from "@/hooks";

const Home = () => {
  const { loading: wordsLoading, error: wordsError } = useFirestoreWords();
  const checkAddable = useAddableWordCheck();
  const { t } = useLocale();
  const [word, setWord] = useState("");
  const [pendingWord, setPendingWord] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    setWord("");
    inputRef.current?.focus();
  };

  const handleAddWord = () => {
    if (!word) return;

    if (!checkAddable(word)) {
      clear();
      return;
    }

    setPendingWord(word);
  };

  if (wordsLoading) {
    return (
      <PageContainer width="narrow">
        <LoadingState label={t("common.loading")} />
      </PageContainer>
    );
  }

  if (wordsError) {
    return (
      <PageContainer width="narrow">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("common.error")}</EmptyTitle>
            <EmptyDescription>{wordsError}</EmptyDescription>
          </EmptyHeader>
          <ButtonLink href="/home" variant="outline">
            {t("practiceHub.back")}
          </ButtonLink>
        </Empty>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        className="mb-6"
        title={t("addWord.title")}
        actions={
          <>
            <ButtonLink href="/profile" variant="outline">
              {t("menu.profile")}
            </ButtonLink>
            <ButtonLink href="/home" variant="ghost">
              {t("practiceHub.back")}
            </ButtonLink>
          </>
        }
      />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleAddWord();
        }}
      >
        <Input
          className="flex-1"
          placeholder={t("addWord.word")}
          value={word}
          onChange={(e) => setWord(e.target.value.toLowerCase())}
          ref={inputRef}
        />
        <Button onClick={handleAddWord}>{t("addWord.add")}</Button>
      </form>
      <AddWordDialog
        word={pendingWord}
        onClose={() => setPendingWord(null)}
        onFinished={() => {
          setPendingWord(null);
          clear();
        }}
      />
    </PageContainer>
  );
};

export default Home;
