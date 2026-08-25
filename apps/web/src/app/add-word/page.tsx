"use client";

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input } from "@/components/ui";
import { useRef, useState } from "react";
import Link from "next/link";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { auth } from "@/lib/firebase";

interface PendingWord {
  word: string;
  englishDefinition: string;
  chineseTranslation: string;
}

const Home = () => {
  const { words, addWord, loading: wordsLoading, error: wordsError } = useFirestoreWords();
  const { t } = useLocale();
  const [word, setWord] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<PendingWord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    setWord("");
    inputRef.current?.focus();
  };

  const handleConfirmAdd = async () => {
    if (!pending) return;

    setConfirming(true);
    const combinedTranslation = pending.chineseTranslation
      ? `${pending.englishDefinition}\n${pending.chineseTranslation}`
      : pending.englishDefinition;

    try {
      await addWord(pending.word, combinedTranslation);
      setDialogOpen(false);
      setPending(null);
      clear();
    } catch (error) {
      console.error("Failed to add word:", error);
      toast({ title: error instanceof Error ? error.message : t('addWord.addFailed'), variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const handleAddWord = async () => {
    if (!word) return;

    setLoading(true);

    if (words.wordData.has(word)) {
      toast({ title: t('addWord.wordExists').replace('{word}', word), variant: "destructive" });
      clear();
      setLoading(false);
      return;
    }

    if (!/^[a-zA-Z]+$/.test(word)) {
      toast({ title: t('addWord.invalidChars').replace('{word}', word), variant: "destructive" });
      clear();
      setLoading(false);
      return;
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error(t('error.notAuthenticated'));
      }

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ word }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data && typeof data.error === 'string' ? data.error : t('addWord.addFailed'));
      }

      const { chineseTranslation, englishDefinition } = data as {
        chineseTranslation: string | null;
        englishDefinition: string | null;
      };

      if (!englishDefinition) {
        toast({ title: t('addWord.notRecognized').replace('{word}', word), variant: "destructive" });
        clear();
        setLoading(false);
        return;
      }

      setPending({
        word,
        englishDefinition,
        chineseTranslation: chineseTranslation || "",
      });
      setDialogOpen(true);
    } catch (error) {
      console.error("Failed to add word:", error);
      toast({ title: error instanceof Error ? error.message : t('addWord.addFailed'), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (wordsLoading) {
    return (
      <main className="space-y-4">
        <div className="text-center">{t('common.loading')}</div>
      </main>
    );
  }

  if (wordsError) {
    return (
      <main className="space-y-4">
        <div className="text-center text-red-500">{t('common.error')}: {wordsError}</div>
        <div className="text-center">
          <Button render={<Link href="/home" />} nativeButton={false}>
            {t('practiceHub.back')}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <form
        className="flex space-x-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleAddWord();
        }}
      >
        <Input className="w-48" placeholder={t('addWord.word')} value={word} onChange={(e) => setWord(e.target.value.toLowerCase())} ref={inputRef} />
        <Button onClick={handleAddWord} disabled={loading || dialogOpen}>
          {t('addWord.add')}
        </Button>
        <Button render={<Link href="/home" />} nativeButton={false}>
          {t('practiceHub.back')}
        </Button>
        <Button render={<Link href="/profile" />} nativeButton={false}>
          {t('menu.profile')}
        </Button>
      </form>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('addWord.confirmTitle')}: {pending?.word}
            </DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium">{t('addWord.confirmEnglish')}</div>
                <div className="text-sm text-muted-foreground">{pending.englishDefinition}</div>
              </div>
              <div>
                <div className="text-sm font-medium">{t('addWord.confirmChinese')}</div>
                <div className="text-sm text-muted-foreground">{pending.chineseTranslation}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('addWord.cancel')}
            </Button>
            <Button onClick={handleConfirmAdd} disabled={confirming}>
              {t('addWord.confirmAdd')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default Home;
