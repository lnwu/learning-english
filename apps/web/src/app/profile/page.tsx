"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  LoadingState,
  MASTERY_BAR_COLORS,
  PageContainer,
  PageHeader,
  StatTile,
  ToggleGroup,
  ToggleGroupItem,
  getMasteryLevel,
} from "@/components/ui";
import { useFirestoreWords, useLocale, toast, useAuth } from "@/hooks";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";
import { type Locale, type TranslationKey } from "@/lib/i18n";
import { db, getEffectiveUserId } from "@/lib/firebase";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import PracticeHeatmap from "./PracticeHeatmap";
import { ProfileAiSection } from "./ProfileAiSection";
import { WordPerformanceSection } from "./WordPerformanceSection";
import type { MasteryLevel } from "@/lib/masteryCalculator";

const MASTERY_SEGMENTS: Array<{
  key: MasteryLevel;
  labelKey: TranslationKey;
}> = [
  { key: "new", labelKey: "mastery.new" },
  { key: "learning", labelKey: "mastery.learning" },
  { key: "familiar", labelKey: "mastery.familiar" },
  { key: "proficient", labelKey: "mastery.proficient" },
  { key: "mastered", labelKey: "mastery.mastered" },
];

const Profile = observer(() => {
  const { user } = useAuth();
  const { words, deleteWord, resetPracticeRecords, loading, error } =
    useFirestoreWords();
  const [isClient, setIsClient] = useState(false);
  const { locale, setLocale, t } = useLocale();
  const [resetting, setResetting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [practiceTime, setPracticeTime] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    if (!user) return;
    const userId = getEffectiveUserId(user);
    getDocs(collection(db, "users", userId, "practiceTime"))
      .then((snapshot) => {
        setPracticeTime(
          new Map(
            snapshot.docs.map((doc) => [
              doc.id,
              Number(doc.data().seconds) || 0,
            ])
          )
        );
      })
      .catch((err) => {
        console.error("Failed to load practice time:", err);
      });
  }, [user]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const totalWords = words.wordCount;
  const overallAverageTime = words.overallAverageInputTime;

  const wordsWithStats = words.practiceStats;

  const avgMasteryScore = useMemo(() => {
    if (wordsWithStats.length === 0) return 0;
    return Math.round(
      wordsWithStats.reduce((sum, w) => sum + w.masteryScore, 0) /
        wordsWithStats.length
    );
  }, [wordsWithStats]);

  const masteryDistribution = useMemo(() => {
    const counts: Record<MasteryLevel, number> = {
      new: 0,
      learning: 0,
      familiar: 0,
      proficient: 0,
      mastered: 0,
    };
    wordsWithStats.forEach((item) => {
      counts[getMasteryLevel(item.masteryScore)] += 1;
    });
    return counts;
  }, [wordsWithStats]);

  const handleResetRecords = async () => {
    setResetting(true);
    try {
      await resetPracticeRecords();
      toast({
        title: t('profile.resetSuccess'),
        variant: "success",
      });
      setResetting(false);
    } catch (err) {
      console.error("Reset failed:", err);
      toast({
        title: t('profile.resetError'),
        variant: "destructive",
      });
      setResetting(false);
    }
  };

  const handleLanguageChange = (newLocale: Locale) => {
    setLocale(newLocale);
  };

  const handleDeleteWord = async () => {
    if (!wordToDelete) return;
    setDeleting(true);
    try {
      await deleteWord(wordToDelete);
      toast({
        title: t('profile.deleteSuccess'),
        variant: "success",
      });
    } catch (err) {
      console.error("Delete word failed:", err);
      toast({
        title: t('profile.deleteError'),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setWordToDelete(null);
    }
  };

  const handleDeleteRequest = useCallback((word: string) => {
    setWordToDelete(word);
  }, []);

  if (loading) {
    return (
      <PageContainer width="wide">
        <LoadingState label={t('profile.loading')} />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer width="wide">
        <Alert variant="destructive">
          <AlertTitle>{t('common.error')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    isClient && (
      <PageContainer width="wide">
        <PageHeader
          className="mb-6"
          title={t('profile.title')}
          actions={
            <>
              <Button render={<Link href="/words" />} nativeButton={false}>
                {t('profile.practiceWords')}
              </Button>
              <Button render={<Link href="/add-word" />} nativeButton={false} variant="outline">
                {t('addWord.title')}
              </Button>
            </>
          }
        />

        {user && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t('profile.accountInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p>
                <span className="text-muted-foreground">{t('profile.email')}:</span> {user.email}
              </p>
              {user.displayName && (
                <p>
                  <span className="text-muted-foreground">{t('profile.name')}:</span> {user.displayName}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="mb-6 overflow-visible">
          <CardHeader>
            <CardTitle>{t('profile.practiceTimeTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('profile.practiceTimeDesc')}</p>
          </CardHeader>
          <CardContent>
            {practiceTime.size > 0 ? (
              <PracticeHeatmap practiceTime={practiceTime} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('profile.noData')}</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('profile.settings')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            <div className="flex flex-col gap-2 py-6 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <label className="text-sm font-medium">{t('profile.language')}</label>
              <ToggleGroup
                value={[locale]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === 'zh' || next === 'en') {
                    handleLanguageChange(next);
                  }
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="zh">中文</ToggleGroupItem>
                <ToggleGroupItem value="en">English</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <ProfileAiSection />

            <div className="flex flex-col gap-2 py-6 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium text-destructive">{t('profile.resetData')}</h3>
                <p className="text-sm text-muted-foreground">{t('profile.resetDataDesc')}</p>
              </div>
              <Button
                variant="destructive"
                className="shrink-0 self-start sm:self-auto"
                onClick={() => setShowResetDialog(true)}
                disabled={resetting}
              >
                {resetting ? t('common.loading') : t('profile.resetButton')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile value={totalWords} label={t('profile.totalWords')} />
          <StatTile
            value={overallAverageTime !== null ? `${overallAverageTime.toFixed(1)}${t('profile.seconds')}` : t('profile.noData')}
            label={t('profile.averageTime')}
          />
          <StatTile
            value={wordsWithStats.filter(w => w.count > 0).length}
            label={t('profile.wordsPracticed')}
          />
          <StatTile value={`${avgMasteryScore}%`} label={t('profile.avgMastery')} />
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('profile.masteryDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            {wordsWithStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('profile.noPracticeData')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {MASTERY_SEGMENTS.map(({ key, labelKey }) => {
                  const count = masteryDistribution[key];
                  const pct = totalWords > 0 ? Math.round((count / totalWords) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-16 text-sm whitespace-nowrap text-muted-foreground">
                        {t(labelKey)}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted inset-shadow-2xs">
                        <div
                          className={`h-full rounded-full ${MASTERY_BAR_COLORS[key]} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <WordPerformanceSection
          words={words}
          onDelete={handleDeleteRequest}
          t={t}
        />

        {wordsWithStats.length === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{t('profile.noPracticeData')}</EmptyTitle>
              <EmptyDescription>{t('profile.practiceTimeDesc')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {/* Reset Confirmation Dialog */}
        <ConfirmDialog
          open={showResetDialog}
          onOpenChange={setShowResetDialog}
          title={t('profile.resetConfirm')}
          description={t('profile.resetConfirmDesc')}
          confirmText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={handleResetRecords}
          variant="destructive"
        />

        {/* Delete Word Confirmation Dialog */}
        <ConfirmDialog
          open={wordToDelete !== null}
          onOpenChange={(open) => {
            if (!open) setWordToDelete(null);
          }}
          title={t('profile.deleteConfirm', { word: wordToDelete ?? '' })}
          description={t('profile.deleteConfirmDesc')}
          confirmText={deleting ? t('common.loading') : t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={handleDeleteWord}
          variant="destructive"
        />
      </PageContainer>
    )
  );
});

export default Profile;
