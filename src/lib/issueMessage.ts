import type { Language } from './language';

/**
 * An Issue's text in two languages. The API keeps `message` (the source text, written in Hungarian or English) and, made by Ollama in the
 * background about five minutes after the Issue's last change, `messageHu` and `messageEn` (null until they exist). They are not in the
 * generated OpenAPI types until `npm run gen:api` is run against an API that has them, so they are typed here instead of hand-editing the
 * generated file.
 */
export interface IssueMessages {
  message?: string | null;
  messageHu?: string | null;
  messageEn?: string | null;
}

/** The text to show for the chosen language, falling back to the source text while the translation does not exist yet. */
export function localizedIssueMessage(issue: IssueMessages | undefined, language: Language): string | null {
  if (!issue) return null;
  const translated = language === 'hu' ? issue.messageHu : issue.messageEn;
  return translated || issue.message || null;
}
