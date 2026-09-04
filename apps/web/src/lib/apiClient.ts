import { auth } from "@/lib/firebase";
import { getCurrentLocale, t } from "@/lib/i18n";

export async function postJson<T>(
  url: string,
  payload: unknown,
  fallbackError = "请求失败，请稍后重试"
): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error(t("error.notAuthenticated", getCurrentLocale()));
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data.error === "string" ? data.error : fallbackError;
    throw new Error(message);
  }
  return data as T;
}
