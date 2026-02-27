// 多语言支持

export type Locale = 'zh' | 'en';

export const translations = {
  zh: {
    // Common
    'app.title': 'Learning English',
    'common.loading': '加载中...',
    'common.error': '错误',
    'common.confirm': '确认',
    'common.cancel': '取消',
    'common.user': '用户',
    
    // Header/Menu
    'menu.profile': '个人资料',
    'menu.logout': '退出登录',
    
    // Login page
    'login.title': 'Learning English',
    'login.subtitle': '登录以访问您的词汇库',
    'login.signInWithGoogle': '使用 Google 登录',
    'login.dataSaveNote': '您的词汇数据将保存到您的 Google 账户',
    
    // Error messages
    'error.loadWordsFailed': '从云端加载单词失败',
    'error.authFailed': 'Firebase 认证失败',
    'error.notAuthenticated': '用户未登录',
    'error.deleteWordFailed': '从云端删除单词失败',
    'error.removeWordsFailed': '从云端删除单词失败',
    'error.resetFailed': '重置练习记录失败',
    
    // Home page
    'home.title': '练习单词',
    'home.refresh': '刷新单词',
    'home.submit': '提交',
    'home.hint': '提示',
    'home.correct': '正确！',
    'home.editTranslationHint': '双击编辑中文翻译',
    'home.addChineseTranslation': '双击添加中文翻译',
    'home.translationUpdated': '中文翻译已更新',
    'home.translationEmpty': '中文翻译不能为空',
    'home.translationUpdateFailed': '更新翻译失败，请重试',
    
    // Profile page
    'profile.title': '用户资料',
    'profile.loading': '加载您的资料...',
    'profile.accountInfo': '账户信息',
    'profile.email': '邮箱',
    'profile.name': '姓名',
    'profile.statistics': '学习统计',
    'profile.totalWords': '总单词数',
    'profile.averageTime': '平均输入时间',
    'profile.wordsPracticed': '已练习单词',
    'profile.avgMastery': '平均熟练度',
    'profile.speedByLength': '按单词长度分类的平均输入速度',
    'profile.speedByLengthDesc': '根据单词长度分组的平均输入时间',
    'profile.shortWords': '短单词 (≤5字母)',
    'profile.mediumWords': '中等单词 (6-10字母)',
    'profile.longWords': '长单词 (>10字母)',
    'profile.noData': '暂无数据',
    'profile.wordPerformance': '单词表现',
    'profile.wordPerformanceDesc': '单词按平均输入时间排序（最慢的在前）',
    'profile.noPracticeData': '暂无练习数据。开始练习单词以查看统计信息！',
    'profile.practiceWords': '练习单词',
    'profile.allWords': '所有单词',
    'profile.settings': '设置',
    'profile.language': '语言',
    'profile.resetData': '重置练习记录',
    'profile.resetDataDesc': '清除所有单词的练习记录（不删除单词本身）',
    'profile.resetButton': '重置所有记录',
    'profile.resetConfirm': '确定要重置所有练习记录吗？',
    'profile.resetConfirmDesc': '这将清空所有单词的练习数据，但保留单词本身。此操作不可撤销。',
    'profile.resetSuccess': '练习记录已重置',
    'profile.resetError': '重置失败，请重试',
    'profile.practices': '练习',
    'profile.seconds': '秒',
    'profile.mastery': '熟练度',
    'profile.searchWord': '搜索单词...',
    'profile.correct': '正确',
    
    // All Words page
    'allWords.title': '所有单词',
    'allWords.noWords': '还没有添加单词。',
    'allWords.backToAdd': '返回添加单词',
    'allWords.averageSpeed': '平均速度',
    'allWords.mastery': '熟练度',
    'allWords.practiced': '练习',
    'allWords.times': '次',
    
    // Add Word page
    'addWord.title': '添加单词',
    'addWord.word': '单词',
    'addWord.translation': '翻译',
    'addWord.add': '添加',
    'addWord.viewAll': '查看所有单词',
    'addWord.home': '首页',
    'addWord.wordExists': '单词 "{word}" 已存在于列表中。',
    'addWord.invalidChars': '单词 "{word}" 包含无效字符或是拼写错误。',
    'addWord.notRecognized': '单词 "{word}" 未被识别为有效单词。',
    'addWord.translationFailed': '无法获取 "{word}" 的翻译，请重试。',
    'addWord.addFailed': '添加单词到云端失败：',
    'addWord.goHome': '返回首页',
    
    // Sync indicator
    'sync.pending': '个单词待同步',
    'sync.syncing': '同步中...',
    'sync.syncNow': '立即同步',
    
    // Mastery levels
    'mastery.new': '新单词',
    'mastery.learning': '学习中',
    'mastery.familiar': '熟悉',
    'mastery.proficient': '熟练',
    'mastery.mastered': '已掌握',
    // Legacy mastery levels (for backwards compatibility)
    'mastery.notMastered': '未掌握',
    'mastery.beginner': '初学',
  },
  en: {
    // Common
    'app.title': 'Learning English',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'common.user': 'User',
    
    // Header/Menu
    'menu.profile': 'Profile',
    'menu.logout': 'Logout',
    
    // Login page
    'login.title': 'Learning English',
    'login.subtitle': 'Sign in to access your vocabulary',
    'login.signInWithGoogle': 'Sign in with Google',
    'login.dataSaveNote': 'Your vocabulary data will be saved to your Google account',
    
    // Error messages
    'error.loadWordsFailed': 'Failed to load words from cloud',
    'error.authFailed': 'Failed to authenticate with Firebase',
    'error.notAuthenticated': 'User not authenticated',
    'error.deleteWordFailed': 'Failed to delete word from cloud',
    'error.removeWordsFailed': 'Failed to remove words from cloud',
    'error.resetFailed': 'Failed to reset practice records',
    
    // Home page
    'home.title': 'Practice Words',
    'home.refresh': 'Refresh Words',
    'home.submit': 'Submit',
    'home.hint': 'Hint',
    'home.correct': 'Correct!',
    'home.editTranslationHint': 'Double-click to edit Chinese translation',
    'home.addChineseTranslation': 'Double-click to add Chinese translation',
    'home.translationUpdated': 'Chinese translation updated',
    'home.translationEmpty': 'Chinese translation cannot be empty',
    'home.translationUpdateFailed': 'Failed to update translation. Please try again.',
    
    // Profile page
    'profile.title': 'User Profile',
    'profile.loading': 'Loading your profile...',
    'profile.accountInfo': 'Account Information',
    'profile.email': 'Email',
    'profile.name': 'Name',
    'profile.statistics': 'Learning Statistics',
    'profile.totalWords': 'Total Words',
    'profile.averageTime': 'Average Input Time',
    'profile.wordsPracticed': 'Words Practiced',
    'profile.avgMastery': 'Average Mastery',
    'profile.speedByLength': 'Average Input Speed by Word Length',
    'profile.speedByLengthDesc': 'Average input time grouped by word length',
    'profile.shortWords': 'Short Words (≤5 letters)',
    'profile.mediumWords': 'Medium Words (6-10 letters)',
    'profile.longWords': 'Long Words (>10 letters)',
    'profile.noData': 'No data',
    'profile.wordPerformance': 'Word Performance',
    'profile.wordPerformanceDesc': 'Words sorted by average input time (slowest first)',
    'profile.noPracticeData': 'No practice data yet. Start practicing words to see your statistics!',
    'profile.practiceWords': 'Practice Words',
    'profile.allWords': 'All Words',
    'profile.settings': 'Settings',
    'profile.language': 'Language',
    'profile.resetData': 'Reset Practice Records',
    'profile.resetDataDesc': 'Clear all practice records (words themselves will not be deleted)',
    'profile.resetButton': 'Reset All Records',
    'profile.resetConfirm': 'Are you sure you want to reset all practice records?',
    'profile.resetConfirmDesc': 'This will clear all practice data for all words, but keep the words themselves. This action cannot be undone.',
    'profile.resetSuccess': 'Practice records have been reset',
    'profile.resetError': 'Reset failed, please try again',
    'profile.practices': 'practices',
    'profile.seconds': 's',
    'profile.mastery': 'Mastery',
    'profile.searchWord': 'Search word...',
    'profile.correct': 'correct',
    
    // All Words page
    'allWords.title': 'All Words',
    'allWords.noWords': 'No words added yet.',
    'allWords.backToAdd': 'Back to Add Word',
    'allWords.averageSpeed': 'Avg Speed',
    'allWords.mastery': 'Mastery',
    'allWords.practiced': 'Practiced',
    'allWords.times': 'times',
    
    // Add Word page
    'addWord.title': 'Add Word',
    'addWord.word': 'Word',
    'addWord.translation': 'Translation',
    'addWord.add': 'Add',
    'addWord.viewAll': 'View All Words',
    'addWord.home': 'Home',
    'addWord.wordExists': 'The word "{word}" already exists in the list.',
    'addWord.invalidChars': 'The word "{word}" contains invalid characters or is a typo.',
    'addWord.notRecognized': 'The word "{word}" is not recognized as a real word.',
    'addWord.translationFailed': 'Could not get translation for "{word}". Please try again.',
    'addWord.addFailed': 'Failed to add word to cloud: ',
    'addWord.goHome': 'Go Home',
    
    // Sync indicator
    'sync.pending': 'words pending',
    'sync.syncing': 'Syncing...',
    'sync.syncNow': 'Sync Now',
    
    // Mastery levels
    'mastery.new': 'New',
    'mastery.learning': 'Learning',
    'mastery.familiar': 'Familiar',
    'mastery.proficient': 'Proficient',
    'mastery.mastered': 'Mastered',
    // Legacy mastery levels (for backwards compatibility)
    'mastery.notMastered': 'Not Mastered',
    'mastery.beginner': 'Beginner',
  },
};

// 获取翻译文本
export function t(key: string, locale: Locale = 'zh'): string {
  return translations[locale][key as keyof typeof translations['zh']] || key;
}

// 获取当前语言
export function getCurrentLocale(): Locale {
  if (typeof window === 'undefined') return 'zh';
  const stored = localStorage.getItem('locale');
  return (stored === 'en' ? 'en' : 'zh') as Locale;
}

// 设置语言
export function setLocale(locale: Locale): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('locale', locale);
    window.dispatchEvent(new Event('localechange'));
  }
}
