import SentDm from '@sentdm/sentdm';

export interface SendRequest {
  to: string;
  channel?: string;
  text?: string;
  template?: { name: string; parameters: Record<string, string> };
  scheduledAt?: Date;
  idempotencyKey?: string;
}

export interface MessageStatus {
  status?: string;
  channel?: string;
}

export interface TemplateReport {
  purpose: string;
  preferred: string;
  preferredStatus: string;
  using: string;
}

export interface Messenger {
  send(request: SendRequest): Promise<string>;
  cancel(messageId: string): Promise<void>;
  status(messageId: string): Promise<MessageStatus>;
  templateReport(): Promise<TemplateReport[]>;
  verify(): Promise<string[]>;
}

export interface TemplateLists {
  reminder: string;
  confirmation: string;
  reschedule: string;
}

const STATUS_TTL_MS = 5 * 60_000;
const DELIVERY_CHANNELS = new Set(['sms', 'mms', 'whatsapp', 'rcs']);
const PURPOSES: Record<keyof TemplateLists, string> = {
  reminder: 'Reminder',
  confirmation: 'Booking confirmation',
  reschedule: 'Reschedule notice',
};

const names = (list: string) => list.split(',').map((n) => n.trim()).filter(Boolean);

export function createSentMessenger(options: { sandbox: boolean; templates: TemplateLists }): Messenger {
  const client = new SentDm();
  const { sandbox, templates } = options;

  let statuses = new Map<string, string | undefined>();
  let loadedAt = 0;

  async function templateStatuses(force = false) {
    if (!force && Date.now() - loadedAt < STATUS_TTL_MS) return statuses;
    const fresh = new Map<string, string | undefined>();
    for (let page = 1; page <= 20; page++) {
      const response = await client.templates.list({ page, page_size: 100 });
      for (const template of response.data?.templates ?? []) {
        if (template.name) fresh.set(template.name, template.status);
      }
      if (!response.data?.pagination?.has_more) break;
    }
    statuses = fresh;
    loadedAt = Date.now();
    return statuses;
  }

  async function resolve(list: string): Promise<string> {
    const candidates = names(list);
    if (candidates.length <= 1) return candidates[0] ?? list;
    try {
      const known = await templateStatuses();
      return candidates.find((n) => known.get(n) === 'APPROVED') ?? candidates[0]!;
    } catch {
      return candidates[candidates.length - 1]!;
    }
  }

  return {
    async send(request) {
      const template = request.template && { ...request.template, name: await resolve(request.template.name) };
      const response = await client.messages.send({
        to: [request.to],
        ...(request.channel && { channel: [request.channel] }),
        ...(request.text && { text: request.text }),
        ...(template && { template }),
        ...(request.scheduledAt && { scheduled_at: request.scheduledAt.toISOString() }),
        sandbox,
        ...(request.idempotencyKey && { 'Idempotency-Key': request.idempotencyKey }),
      });
      const recipient = response.data?.recipients?.[0];
      if (!recipient?.message_id) {
        throw new Error('Sent accepted the request without a message id');
      }
      return recipient.message_id;
    },

    async cancel(messageId) {
      try {
        await client.messages.cancel(messageId, { sandbox });
      } catch (err) {
        if (!(err instanceof SentDm.ConflictError)) {
          throw err;
        }
      }
    },

    async status(messageId) {
      const response = await client.messages.retrieveStatus(messageId);
      const channel = response.data?.channel?.toLowerCase();
      return { status: response.data?.status?.toLowerCase(), channel: channel && DELIVERY_CHANNELS.has(channel) ? channel : undefined };
    },

    async templateReport() {
      const known = await templateStatuses();
      const report: TemplateReport[] = [];
      for (const key of Object.keys(PURPOSES) as (keyof TemplateLists)[]) {
        const candidates = names(templates[key]);
        const [preferred] = candidates;
        if (!preferred) continue;
        report.push({
          purpose: PURPOSES[key],
          preferred,
          preferredStatus: known.get(preferred) ?? 'MISSING',
          using: candidates.find((n) => known.get(n) === 'APPROVED') ?? preferred,
        });
      }
      return report;
    },

    async verify() {
      const warnings: string[] = [];
      const known = await templateStatuses(true);

      for (const key of Object.keys(PURPOSES) as (keyof TemplateLists)[]) {
        const candidates = names(templates[key]);
        if (candidates.length === 0) continue;
        const approved = candidates.find((n) => known.get(n) === 'APPROVED');
        const purpose = PURPOSES[key].toLowerCase();
        if (!approved) {
          const detail = candidates.map((n) => `${n} is ${known.get(n) ?? 'missing'}`).join(', ');
          warnings.push(`No approved template for ${purpose} (${detail}). Live ${purpose} texts will be blocked.`);
        } else if (approved !== candidates[0]) {
          warnings.push(`Using "${approved}" for ${purpose} until "${candidates[0]}" is approved (it is ${known.get(candidates[0]!) ?? 'missing'}).`);
        }
      }
      if (sandbox) {
        warnings.push('SENT_SANDBOX is true: requests are validated but nothing is delivered.');
      }
      return warnings;
    },
  };
}
