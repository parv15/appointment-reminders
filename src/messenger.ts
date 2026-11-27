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
  reason?: string;
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
  twoWay(): Promise<boolean>;
}

export interface TemplateLists {
  reminder: string;
  confirmation: string;
  reschedule: string;
  cancellation: string;
}

const STATUS_TTL_MS = 5 * 60_000;
export const DELIVERY_CHANNELS = new Set(['sms', 'mms', 'whatsapp', 'rcs']);
const PURPOSES: Record<keyof TemplateLists, string> = {
  reminder: 'Reminder',
  confirmation: 'Booking confirmation',
  reschedule: 'Reschedule notice',
  cancellation: 'Cancellation notice',
};

const names = (list: string) => list.split(',').map((n) => n.trim()).filter(Boolean);

export function createSentMessenger(options: { sandbox: boolean; templates: TemplateLists }): Messenger {
  const client = new SentDm({ timeout: 15_000 });
  const { sandbox, templates } = options;

  let twoWayCache: { value: boolean; at: number } | undefined;
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
        if (!(err instanceof SentDm.ConflictError || err instanceof SentDm.NotFoundError)) {
          throw err;
        }
      }
    },

    async status(messageId) {
      const response = await client.messages.retrieveStatus(messageId);
      const channel = response.data?.channel?.toLowerCase();
      const reason = response.data?.events?.find((event) => event.reason)?.reason;
      return { status: response.data?.status?.toLowerCase(), channel: channel && DELIVERY_CHANNELS.has(channel) ? channel : undefined, ...(reason && { reason }) };
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

    async twoWay() {
      if (sandbox) return true;
      if (twoWayCache && Date.now() - twoWayCache.at < STATUS_TTL_MS) return twoWayCache.value;
      const channels = (await client.channels.list()).data;
      const value = Boolean(channels?.sms?.some((market) => market.number_type !== 'ALPHANUMERIC' && market.numbers?.some((n) => n.status === 'ACTIVE')) || channels?.whatsapp || channels?.rcs);
      twoWayCache = { value, at: Date.now() };
      return value;
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
      if (!(await this.twoWay().catch(() => true))) {
        warnings.push('Your Sent account has no channel that can receive replies. An alphanumeric sender ID such as a brand name sends one way, so C and R replies will not arrive until you add an SMS number, WhatsApp or RCS in the Sent dashboard.');
      }
      if (sandbox) {
        warnings.push('SENT_SANDBOX is true: requests are validated but nothing is delivered.');
      }
      return warnings;
    },
  };
}
