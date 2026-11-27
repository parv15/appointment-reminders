export type AppointmentStatus = 'scheduled' | 'confirmed' | 'reschedule_requested' | 'cancelled';
export type Attention = 'reschedule' | 'no_reply' | null;

export interface AppConfig {
  businessName: string;
  services: string[];
  timezone: string;
  defaultCountryCode: string;
  reminderOptions: number[];
  maxAdvanceDays: number;
  days: string[];
  confirmationAlerts: boolean;
  sandbox: boolean;
  repliesInText: boolean;
  repliesPossible: boolean;
}

export interface SlotsResponse {
  date: string;
  slots: string[];
}

export interface PublicBooking {
  id: string;
  name: string;
  service: string;
  phone: string;
  startsAt: string;
  status: AppointmentStatus;
  alertStatus: string | null;
  alertChannel: string | null;
  reminderMinutes: number;
  reminderStatus: string | null;
}

export interface CreatedBooking extends PublicBooking {
  alertError?: string;
}

export interface BookingRequest {
  service: string;
  startsAt: string;
  reminderMinutes: number;
  name: string;
  phone: string;
}

export interface Appointment {
  id: string;
  name: string;
  service: string;
  phone: string;
  startsAt: string;
  status: AppointmentStatus;
  reminderLeadMinutes: number | null;
  reminderMessageId: string | null;
  reminderStatus: string | null;
  reminderChannel: string | null;
  confirmationMessageId: string | null;
  confirmationStatus: string | null;
  confirmationChannel: string | null;
  lastReply: string | null;
  lastReplyAt: string | null;
  createdAt: string;
  attention: Attention;
}

export interface AppointmentChange extends Appointment {
  confirmationError?: string;
}

export interface ActivityItem {
  at: string;
  kind: 'booked' | 'alert' | 'reminder' | 'reply';
  appointmentId: string;
  name: string;
  phone: string;
  service: string;
  startsAt: string;
  status?: string;
  channel?: string;
  detail?: string;
}

export interface TemplateReport {
  purpose: string;
  preferred: string;
  preferredStatus: string;
  using: string;
}

export interface AdminSession {
  required: boolean;
  signedIn: boolean;
}

export interface PickerValue {
  service: string;
  startsAt: string;
  reminderMinutes: number;
}
