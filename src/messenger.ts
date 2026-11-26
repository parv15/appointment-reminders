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
}

export interface SentMessenger extends Messenger {
  verify(): Promise<string[]>;
}

export function createSentMessenger(options: { sandbox: boolean; templateName: string }): SentMessenger {
  const client = new SentDm();
  const { sandbox, templateName } = options;

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

    async verify() {
      const warnings: string[] = [];
      let template: { status?: string } | undefined;

      for (let page = 1; page <= 20 && !template; page++) {
        const response = await client.templates.list({ page, page_size: 100 });
        template = response.data?.templates?.find((t) => t.name === templateName);
        if (!response.data?.pagination?.has_more) break;
      }

      if (!template) {
        warnings.push(`Template "${templateName}" was not found on your Sent account. Create it or set SENT_TEMPLATE_NAME.`);
      } else if (template.status !== 'APPROVED') {
        warnings.push(`Template "${templateName}" is ${template.status}. Live reminders are blocked until it is APPROVED.`);
      }
      if (sandbox) {
        warnings.push('SENT_SANDBOX is true: requests are validated but nothing is delivered.');
      }
      return warnings;
    },
  };
}
