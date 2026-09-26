// 多语言支持

export type Locale = "zh" | "en";

export function localeToHtmlLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

export function detectLocaleFromAcceptLanguage(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return "zh";
  const normalized = acceptLanguage.toLowerCase();
  return normalized.includes("zh") ? "zh" : "en";
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "zh";
  const candidates = [...(navigator.languages || []), navigator.language]
    .filter(Boolean)
    .map((item) => item.toLowerCase());
  const hasZh = candidates.some((item) => item.startsWith("zh"));
  return hasZh ? "zh" : "en";
}

const zh = {
  // Common
  "common.loading": "加载中...",
  "common.error": "错误",
  "common.confirm": "确认",
  "common.cancel": "取消",
  "common.user": "用户",

  // Header/Menu
  "menu.profile": "个人资料",
  "menu.logout": "退出登录",

  // Login page
  "login.title": "Learning English",
  "login.subtitle": "登录以访问您的词汇库",
  "login.signInWithGoogle": "使用 Google 登录",
  "login.dataSaveNote": "您的词汇数据将保存到您的 Google 账户",

  // Error messages
  "error.loadWordsFailed": "从云端加载单词失败",
  "error.authFailed": "Firebase 认证失败",
  "error.notAuthenticated": "用户未登录",
  "error.deleteWordFailed": "从云端删除单词失败",
  "error.resetFailed": "重置练习记录失败",
  "error.updateTranslationFailed": "更新释义失败，请稍后重试",
  "error.normalizeWordFailed": "归一化单词失败，请稍后重试",
  "error.wordNotFound": "未找到单词",
  "error.requestFailed": "请求失败，请稍后重试",

  // Home page
  "home.refresh": "刷新单词",
  "home.hint": "提示",
  "home.noTranslation": "暂无中文翻译",

  // Sentence practice
  "sentence.title": "造句练习",
  "sentence.generating": "正在生成题目...",
  "sentence.checking": "批改中...",
  "sentence.submit": "提交",
  "sentence.recheck": "重新批改",
  "sentence.next": "下一题",
  "sentence.words": "目标单词",
  "sentence.answerPlaceholder": "用英文写出这句话",
  "sentence.resultCorrect": "正确",
  "sentence.resultIncorrect": "有待改进",
  "sentence.score": "得分",
  "sentence.reference": "参考答案",
  "sentence.needMoreWords": "词汇库单词不足，请先添加至少 2 个单词。",
  "sentence.generateFailed": "生成失败，请稍后重试",
  "sentence.checkFailed": "批改失败，请稍后重试",

  // Practice hub (home)
  "practiceHub.title": "练习中心",
  "practiceHub.subtitle": "选择一种练习方式开始学习",
  "practiceHub.words.title": "单词练习",
  "practiceHub.words.description": "根据中文提示拼写单词，巩固词汇记忆",
  "practiceHub.sentence.title": "造句练习",
  "practiceHub.sentence.description": "用词汇库的单词造句，练习真实语境中的表达",
  "practiceHub.back": "返回练习中心",
  "words.emptyLibraryTitle": "词库为空",
  "words.emptyLibraryDescription": "先添加单词，开始拼写练习。",
  "words.allReviewedTitle": "今天的复习已完成",
  "words.allReviewedDescription": "所有单词今天都已复习或达到上限，明天再来继续。",

  // Profile page
  "profile.title": "用户资料",
  "profile.loading": "加载您的资料...",
  "profile.accountInfo": "账户信息",
  "profile.email": "邮箱",
  "profile.name": "姓名",
  "profile.totalWords": "总单词数",
  "profile.averageTime": "平均输入时间",
  "profile.wordsPracticed": "已练习单词",
  "profile.avgMastery": "平均熟练度",
  "profile.masteryDistribution": "熟练度等级分布",
  "profile.speedByLength": "个人打字基线（按词长）",
  "profile.speedByLengthDesc":
    "拼写流畅度以同长度档其他单词耗时的中位数为参照（排除本词）；每档不足 5 条计时样本时回退按单词长度估算",
  "profile.shortWords": "短单词 (≤5字母)",
  "profile.mediumWords": "中等单词 (6-10字母)",
  "profile.longWords": "长单词 (>10字母)",
  "profile.noData": "暂无数据",
  "profile.baselineInsufficient": "样本不足",
  "profile.noPracticeData": "暂无练习数据。开始练习单词以查看统计信息！",
  "profile.practiceWords": "练习单词",
  "profile.settings": "设置",
  "profile.language": "语言",
  "profile.resetData": "重置练习记录",
  "profile.resetDataDesc": "清除所有单词的练习记录（不删除单词本身）",
  "profile.resetButton": "重置所有记录",
  "profile.resetConfirm": "确定要重置所有练习记录吗？",
  "profile.resetConfirmDesc": "这将清空所有单词的练习数据，但保留单词本身。此操作不可撤销。",
  "profile.resetSuccess": "练习记录已重置",
  "profile.resetError": "重置失败，请重试",
  "profile.seconds": "秒",
  "profile.points": "分",
  "profile.mastery": "熟练度",
  "profile.searchWord": "搜索单词...",
  "profile.reviews": "次复习",
  "profile.hints": "次提示",
  "profile.deleteWord": "删除",
  "profile.deleteConfirm": "确定删除「{word}」吗？",
  "profile.deleteConfirmDesc": "这将同时删除该单词的所有练习记录，此操作不可撤销。",
  "profile.deleteSuccess": "单词已删除",
  "profile.deleteError": "删除失败，请重试",
  "profile.regenerateTitle": "AI 重新生成释义",
  "profile.regenerateDesc": "让 AI 重新生成当前记录中所有单词的释义（不会删除或改变练习记录）。",
  "profile.regenerateButton": "重新生成全部释义",
  "profile.regenerateConfirm": "确定要重新生成全部单词的释义吗？",
  "profile.regenerateConfirmDesc":
    "AI 将重新生成当前记录中所有单词的释义，替换原有的释义。此操作会消耗一定时间，且不可撤销。",
  "profile.regenerateSuccess": "已重新生成 {success} 个单词的释义",
  "profile.regeneratePartial": "已重新生成 {success} 个单词的释义，{skipped} 个保留原释义",
  "profile.regenerateFailed": "重新生成释义失败，请稍后重试",
  "profile.normalizeTitle": "归一化词形",
  "profile.normalizeDesc":
    "让 AI 把词库中已有的屈折形式（复数、过去式等）统一为词典原形；重复的单词会合并为一条，练习记录一并保留。",
  "profile.normalizeButton": "归一化全部单词",
  "profile.normalizeConfirm": "确定要归一化全部单词吗？",
  "profile.normalizeConfirmDesc":
    "AI 会检查当前所有单词，把屈折形式还原为词典原形；若原形已存在，则合并为一条并保留两边的练习记录。此操作不可撤销。",
  "profile.normalizeSuccess": "已归一化 {renamed} 个单词，合并 {merged} 个重复单词",
  "profile.normalizeNone": "没有需要归一化的单词",
  "profile.normalizePartial":
    "已归一化 {renamed} 个单词，合并 {merged} 个；{failed} 个单词请求失败，可稍后重试",
  "profile.normalizeFailed": "归一化失败，请稍后重试",
  "profile.practiceTimeTitle": "每日练习时间",
  "profile.practiceTimeDesc": "统计停留在单词练习或造句练习页面且窗口处于激活状态的时长",
  "profile.weekdayMon": "一",
  "profile.weekdayWed": "三",
  "profile.weekdayFri": "五",
  "profile.practiceTimeLess": "少",
  "profile.practiceTimeMore": "多",

  // Add Word page
  "addWord.title": "添加单词",
  "addWord.word": "单词",
  "addWord.add": "添加",
  "addWord.wordExists": '单词 "{word}" 已存在于列表中。',
  "addWord.invalidChars": '单词 "{word}" 包含无效字符或是拼写错误。',
  "addWord.notRecognized": '单词 "{word}" 未被识别为有效单词。',
  "addWord.addFailed": "添加单词到云端失败：",
  "addWord.confirmTitle": "确认添加单词",
  "addWord.confirmSenses": "词义",
  "addWord.confirmAdd": "确认添加",
  "addWord.cancel": "取消",
  "addWord.addSuccess": "单词已添加",
  "addWord.saveLemma": "保存原形：{word}",
  "addWord.keepOriginal": "保留原词：{word}",
  "addWord.existsTitle": "单词已存在",
  "addWord.baseExists": "「{word}」的原形「{lemma}」已在词库中，无需重复添加。",
  "addWord.gotIt": "知道了",

  // Sync indicator
  "sync.pending": "个单词待同步",
  "sync.syncing": "同步中...",
  "sync.syncNow": "立即同步",
  "sync.dataLost": "部分练习记录多次同步失败，已丢失",
  "sync.storageFailed": "本地存储写入失败，练习记录暂存于本页内存中，请立即同步以免丢失",

  // Mastery levels
  "mastery.new": "新单词",
  "mastery.learning": "学习中",
  "mastery.familiar": "熟悉",
  "mastery.proficient": "熟练",
  "mastery.mastered": "已掌握",
};

export type TranslationKey = keyof typeof zh;

const en: Record<TranslationKey, string> = {
  // Common
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.user": "User",

  // Header/Menu
  "menu.profile": "Profile",
  "menu.logout": "Logout",

  // Login page
  "login.title": "Learning English",
  "login.subtitle": "Sign in to access your vocabulary",
  "login.signInWithGoogle": "Sign in with Google",
  "login.dataSaveNote": "Your vocabulary data will be saved to your Google account",

  // Error messages
  "error.loadWordsFailed": "Failed to load words from cloud",
  "error.authFailed": "Failed to authenticate with Firebase",
  "error.notAuthenticated": "User not authenticated",
  "error.deleteWordFailed": "Failed to delete word from cloud",
  "error.resetFailed": "Failed to reset practice records",
  "error.updateTranslationFailed": "Failed to update definitions, please try again",
  "error.normalizeWordFailed": "Failed to normalize words, please try again",
  "error.wordNotFound": "Word not found",
  "error.requestFailed": "Request failed, please try again later",

  // Home page
  "home.refresh": "Refresh Words",
  "home.hint": "Hint",
  "home.noTranslation": "No Chinese translation",

  // Sentence practice
  "sentence.title": "Sentence Practice",
  "sentence.generating": "Generating question...",
  "sentence.checking": "Checking...",
  "sentence.submit": "Submit",
  "sentence.recheck": "Re-check",
  "sentence.next": "Next",
  "sentence.words": "Target Words",
  "sentence.answerPlaceholder": "Write this sentence in English",
  "sentence.resultCorrect": "Correct",
  "sentence.resultIncorrect": "Needs Improvement",
  "sentence.score": "Score",
  "sentence.reference": "Reference",
  "sentence.needMoreWords": "Not enough words. Please add at least 2 words first.",
  "sentence.generateFailed": "Failed to generate the question, please try again",
  "sentence.checkFailed": "Failed to check the answer, please try again",

  // Practice hub (home)
  "practiceHub.title": "Practice Hub",
  "practiceHub.subtitle": "Choose a practice mode to start learning",
  "practiceHub.words.title": "Word Practice",
  "practiceHub.words.description": "Spell words from Chinese hints to reinforce vocabulary",
  "practiceHub.sentence.title": "Sentence Practice",
  "practiceHub.sentence.description": "Build sentences with your words in real-life contexts",
  "practiceHub.back": "Back to Hub",
  "words.emptyLibraryTitle": "Your word list is empty",
  "words.emptyLibraryDescription": "Add a word to start spelling practice.",
  "words.allReviewedTitle": "All caught up for today",
  "words.allReviewedDescription":
    "Every word has been reviewed or hit the daily limit. Come back tomorrow.",

  // Profile page
  "profile.title": "User Profile",
  "profile.loading": "Loading your profile...",
  "profile.accountInfo": "Account Information",
  "profile.email": "Email",
  "profile.name": "Name",
  "profile.totalWords": "Total Words",
  "profile.averageTime": "Average Input Time",
  "profile.wordsPracticed": "Words Practiced",
  "profile.avgMastery": "Average Mastery",
  "profile.masteryDistribution": "Mastery Distribution",
  "profile.speedByLength": "Typing Baseline by Word Length",
  "profile.speedByLengthDesc":
    "Fluency compares each word against the median typing time of other words in the same length group; falls back to a length estimate until a group has 5 samples",
  "profile.shortWords": "Short Words (≤5 letters)",
  "profile.mediumWords": "Medium Words (6-10 letters)",
  "profile.longWords": "Long Words (>10 letters)",
  "profile.noData": "No data",
  "profile.baselineInsufficient": "Not enough data",
  "profile.noPracticeData": "No practice data yet. Start practicing words to see your statistics!",
  "profile.practiceWords": "Practice Words",
  "profile.settings": "Settings",
  "profile.language": "Language",
  "profile.resetData": "Reset Practice Records",
  "profile.resetDataDesc": "Clear all practice records (words themselves will not be deleted)",
  "profile.resetButton": "Reset All Records",
  "profile.resetConfirm": "Are you sure you want to reset all practice records?",
  "profile.resetConfirmDesc":
    "This will clear all practice data for all words, but keep the words themselves. This action cannot be undone.",
  "profile.resetSuccess": "Practice records have been reset",
  "profile.resetError": "Reset failed, please try again",
  "profile.seconds": "s",
  "profile.points": "pts",
  "profile.mastery": "Mastery",
  "profile.searchWord": "Search word...",
  "profile.reviews": "reviews",
  "profile.hints": "hints",
  "profile.deleteWord": "Delete",
  "profile.deleteConfirm": 'Delete "{word}"?',
  "profile.deleteConfirmDesc":
    "This will also delete all practice records for this word. This action cannot be undone.",
  "profile.deleteSuccess": "Word deleted",
  "profile.deleteError": "Failed to delete, please try again",
  "profile.regenerateTitle": "Regenerate Definitions with AI",
  "profile.regenerateDesc":
    "Let AI regenerate the definitions of all words in the current records (practice records will not be deleted or changed).",
  "profile.regenerateButton": "Regenerate All Definitions",
  "profile.regenerateConfirm": "Regenerate definitions for all words?",
  "profile.regenerateConfirmDesc":
    "AI will regenerate the definitions of all words in the current records, replacing the existing ones. This takes some time and cannot be undone.",
  "profile.regenerateSuccess": "Regenerated definitions for {success} words",
  "profile.regeneratePartial":
    "Regenerated definitions for {success} words, kept {skipped} unchanged",
  "profile.regenerateFailed": "Failed to regenerate definitions, please try again",
  "profile.normalizeTitle": "Normalize Word Forms with AI",
  "profile.normalizeDesc":
    "Let AI convert inflected forms in your library (plurals, past tense, etc.) to their dictionary base form. Duplicates are merged into one entry and both sets of practice records are kept.",
  "profile.normalizeButton": "Normalize All Words",
  "profile.normalizeConfirm": "Normalize all words?",
  "profile.normalizeConfirmDesc":
    "AI will check all words and convert inflected forms back to their base form. If a base form already exists, the two entries are merged and both sets of practice records are kept. This action cannot be undone.",
  "profile.normalizeSuccess": "Normalized {renamed} words, merged {merged} duplicates",
  "profile.normalizeNone": "No words need normalization",
  "profile.normalizePartial":
    "Normalized {renamed} words and merged {merged}; {failed} words failed and can be retried later",
  "profile.normalizeFailed": "Failed to normalize words, please try again",
  "profile.practiceTimeTitle": "Daily Practice Time",
  "profile.practiceTimeDesc":
    "Time counted while the window is on the word or sentence practice page and is active",
  "profile.weekdayMon": "Mon",
  "profile.weekdayWed": "Wed",
  "profile.weekdayFri": "Fri",
  "profile.practiceTimeLess": "Less",
  "profile.practiceTimeMore": "More",

  // Add Word page
  "addWord.title": "Add Word",
  "addWord.word": "Word",
  "addWord.add": "Add",
  "addWord.wordExists": 'The word "{word}" already exists in the list.',
  "addWord.invalidChars": 'The word "{word}" contains invalid characters or is a typo.',
  "addWord.notRecognized": 'The word "{word}" is not recognized as a real word.',
  "addWord.addFailed": "Failed to add word to cloud: ",
  "addWord.confirmTitle": "Confirm Word",
  "addWord.confirmSenses": "Senses",
  "addWord.confirmAdd": "Add",
  "addWord.cancel": "Cancel",
  "addWord.addSuccess": "Word added",
  "addWord.saveLemma": "Save base form: {word}",
  "addWord.keepOriginal": "Keep original: {word}",
  "addWord.existsTitle": "Word Already Exists",
  "addWord.baseExists": 'The base form of "{word}" is "{lemma}", which is already in your list.',
  "addWord.gotIt": "Got it",

  // Sync indicator
  "sync.pending": "words pending",
  "sync.syncing": "Syncing...",
  "sync.syncNow": "Sync Now",
  "sync.dataLost": "Some practice records failed to sync repeatedly and were lost",
  "sync.storageFailed":
    "Local storage write failed. Practice records are kept in memory on this page only — sync now to avoid losing them.",

  // Mastery levels
  "mastery.new": "New",
  "mastery.learning": "Learning",
  "mastery.familiar": "Familiar",
  "mastery.proficient": "Proficient",
  "mastery.mastered": "Mastered",
};

export const translations = { zh, en };

export type TranslationParams = Record<string, string | number>;

export function formatMessage(template: string, params: TranslationParams): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

// 获取翻译文本
export function t(key: TranslationKey, locale: Locale = "zh", params?: TranslationParams): string {
  const text = translations[locale][key] ?? translations.zh[key];
  return params ? formatMessage(text, params) : text;
}

const LOCALE_COOKIE = "locale";

function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )locale=(zh|en)(?:;|$)/);
  return match ? (match[1] as Locale) : null;
}

export function getCurrentLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const fromCookie = readLocaleCookie();
  if (fromCookie) return fromCookie;
  const legacy = localStorage.getItem(LOCALE_COOKIE);
  if (legacy === "zh" || legacy === "en") return legacy;
  return detectBrowserLocale();
}

export function tNow(key: TranslationKey, params?: TranslationParams): string {
  return t(key, getCurrentLocale(), params);
}

export function setLocale(locale: Locale): void {
  if (typeof window !== "undefined") {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    localStorage.removeItem(LOCALE_COOKIE);
    window.dispatchEvent(new Event("localechange"));
  }
}
