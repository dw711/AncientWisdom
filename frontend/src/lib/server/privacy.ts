/**
 * Removes obvious contact details before text leaves the server for a model
 * provider. This is a best-effort filter, not anonymisation.
 */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (match) => (match.replace(/\D/g, "").length >= 9 ? "[number]" : match));
}
