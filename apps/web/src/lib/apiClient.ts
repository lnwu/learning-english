import { getAuthInstance } from "@/lib/firebase";
import { getSelectedAiModel } from "@/lib/aiModelPreference";
import { getCurrentLocale, t, tNow } from "@/lib/i18n";

export async function postApi<T>(
  url: string,
  payload: unknown,
  fallbackError = tNow("error.requestFailed"),
): Promise<T> {
  const idToken = await getAuthInstance().currentUser?.getIdToken();
  if (!idToken) {
    throw new Error(t("error.notAuthenticated", getCurrentLocale()));
  }

  const body =
    typeof payload === "object" && payload !== null
      ? { ...(payload as Record<string, unknown>), model: getSelectedAiModel() }
      : payload;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : fallbackError;
    const requestId =
      data && typeof data.requestId === "string"
        ? data.requestId
        : response.headers.get("x-request-id");
    const error = new Error(message);
    if (requestId) Object.assign(error, { requestId });
    throw error;
  }
  return data as T;
}
