import type { AppConfig, TemplateReport } from '@/lib/client/types';

export function TemplateNotice({ config, templates }: { config: AppConfig; templates: TemplateReport[] }) {
  const stale = templates.filter((t) => t.using !== t.preferred);
  const noReplies = config.repliesPossible === false;
  if (!noReplies && stale.length === 0) return null;

  return (
    <div className="notice">
      {noReplies && (
        <>
          <strong>Customers cannot reply to your texts yet</strong>
          <span>
            Your Sent account only has a sender ID that sends one way, or no sender at all. Add an SMS number, WhatsApp or RCS in the Sent dashboard before you rely on C and R replies.
          </span>
        </>
      )}
      {stale.length > 0 && (
        <>
          <strong>Your texts do not tell customers how to reply yet</strong>
          <span>
            Your own templates are waiting for approval from Sent. Until then the standard templates are used, and they leave out "Reply C to confirm or R to reschedule". The app switches over by itself once yours are approved.
          </span>
          {stale.map((t) => (
            <span key={t.purpose} className="muted">
              {t.purpose}: "{t.preferred}" is {t.preferredStatus.toLowerCase()}, so texts use "{t.using}" for now.
            </span>
          ))}
        </>
      )}
    </div>
  );
}
