const FIXES: Record<string, string> = {
  BUSINESS_035: 'The Sent account is not onboarded yet, so it can only text its verified number. Finish onboarding in the Sent dashboard or ask Sent support.',
  DELIVERY_003: 'No sender on the account covers this country. Add a sender for the country in Sent. US numbers need a registered 10DLC sender.',
  BUSINESS_029: 'The number the text was sent from is not an active sender on the account.',
};

export function explainReason(reason: string | null | undefined): { message: string; fix: string | null } | null {
  if (!reason) return null;
  const match = /^([A-Z]+_\d+): (.*)$/.exec(reason);
  if (!match) return { message: reason, fix: null };
  return { message: match[2] ?? reason, fix: FIXES[match[1] ?? ''] ?? null };
}
