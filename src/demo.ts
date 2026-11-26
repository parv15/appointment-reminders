import { randomUUID } from 'node:crypto';
import type { Messenger, SendRequest } from './messenger.js';

export interface DemoMessage {
  id: string;
  direction: 'outbound' | 'inbound';
  phone: string;
  channel: string;
  body: string;
  scheduledAt: string | null;
  status: 'scheduled' | 'delivered' | 'cancelled' | 'received';
  createdAt: string;
}

export class DemoMessenger implements Messenger {
  private readonly messages: DemoMessage[] = [];

  constructor(private readonly onStatus: (messageId: string, status: string) => void) {}

  async send(request: SendRequest): Promise<string> {
    const p = request.template?.parameters;
    const body =
      request.text ??
      (p?.service_name
        ? `Hello ${p.customer_name},\n\nThank you for booking with ${p.business_name}.\n\nYour appointment for ${p.service_name} on ${p.appointment_date} at ${p.appointment_time} is confirmed.`
        : `Hello ${p?.customer_name}, this is a reminder about your upcoming appointment with ${p?.business_name} on ${p?.appointment_date} at ${p?.appointment_time}. Reply C to confirm or R to reschedule.`);
    const scheduled = request.scheduledAt !== undefined;
    const message: DemoMessage = {
      id: randomUUID(),
      direction: 'outbound',
      phone: request.to,
      channel: request.channel ?? 'sms',
      body,
      scheduledAt: request.scheduledAt?.toISOString() ?? null,
      status: scheduled ? 'scheduled' : 'delivered',
      createdAt: new Date().toISOString(),
    };
    this.messages.push(message);
    setTimeout(() => this.onStatus(message.id, message.status), 0);
    return message.id;
  }

  async cancel(messageId: string): Promise<void> {
    const message = this.messages.find((m) => m.id === messageId);
    if (message?.status === 'scheduled') {
      message.status = 'cancelled';
      this.onStatus(messageId, 'cancelled');
    }
  }

  release(messageId: string): boolean {
    const message = this.messages.find((m) => m.id === messageId);
    if (message?.status !== 'scheduled') return false;
    message.status = 'delivered';
    this.onStatus(messageId, 'delivered');
    return true;
  }

  recordInbound(phone: string, text: string): void {
    this.messages.push({
      id: randomUUID(),
      direction: 'inbound',
      phone,
      channel: 'sms',
      body: text,
      scheduledAt: null,
      status: 'received',
      createdAt: new Date().toISOString(),
    });
  }

  list(): DemoMessage[] {
    return this.messages;
  }
}
