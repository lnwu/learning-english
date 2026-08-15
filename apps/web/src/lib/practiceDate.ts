export const formatLocalPracticeDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getLocalPracticeDate = (practiceDate: string) => {
  // 已是本地日期格式（YYYY-MM-DD），直接返回，避免 new Date 在负时区解析偏移
  if (/^\d{4}-\d{2}-\d{2}$/.test(practiceDate)) {
    return practiceDate;
  }
  const date = new Date(practiceDate);
  return Number.isNaN(date.getTime())
    ? practiceDate
    : formatLocalPracticeDate(date);
};
