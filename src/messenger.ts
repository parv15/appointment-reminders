import SentDm from '@sentdm/sentdm';

export interface SendRequest {
  to: string;
  channel?: string;
  text?: string;
  template?: { name: string; parameters: Record<string, string> };
  scheduledAt?: Date;
  idempotencyKey?: string;
}

export interface Messenger {
  send(request: SendRequest): Promise<string>;
  cancel(messageId: string): Promise<void>;
  status?(messageId: string): Promise<string | undefined>;
}

export interface SentMessenger extends Messenger {
  verify(): Promise<string[]>;
}

export function createSentMessenger(options: { sandbox: boolean; templateName: string; confirmationTemplateName: string }): SentMessenger {
  const client = new SentDm();
  const { sandbox, templateName, confirmationTemplateName } = options;

  return {
    async send(request) {
      const response = await client.messages.send({
        to: [request.to],
        ...(request.channel && { channel: [request.channel] }),
        ...(request.text && { text: request.text }),
        ...(request.template && { template: request.template }),
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
      return response.data?.status?.toLowerCase();
    },

    async verify() {
      const warnings: string[] = [];
      const statuses = new Map<string, string | undefined>();

      for (let page = 1; page <= 20; page++) {
        const response = await client.templates.list({ page, page_size: 100 });
        for (const template of response.data?.templates ?? []) {
          if (template.name) statuses.set(template.name, template.status);
        }
        if (!response.data?.pagination?.has_more) break;
      }

      const wanted = [
        { name: templateName, variable: 'SENT_TEMPLATE_NAME', purpose: 'reminders' },
        ...(confirmationTemplateName ? [{ name: confirmationTemplateName, variable: 'SENT_CONFIRMATION_TEMPLATE', purpose: 'booking alerts' }] : []),
      ];
      for (const { name, variable, purpose } of wanted) {
        const status = statuses.get(name);
        if (status === undefined) {
          warnings.push(`Template "${name}" was not found on your Sent account, so ${purpose} will fail. Create it or change ${variable}.`);
        } else if (status !== 'APPROVED') {
          warnings.push(`Template "${name}" is ${status}, so live ${purpose} are blocked until it is APPROVED.`);
        }
      }
      if (sandbox) {
        warnings.push('SENT_SANDBOX is true: requests are validated but nothing is delivered.');
      }
      return warnings;
    },
  };
}
