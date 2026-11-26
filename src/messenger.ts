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

export function createSentMessenger(sandbox: boolean): Messenger {
  const client = new SentDm();

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
  };
}
