import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { api } from './api';
import type { AppConfig, PickerValue, SlotsResponse } from './types';

export const MIN_REMINDER_GAP_MS = 3 * 60_000;

export const reminderFeasible = (slot: string | null, minutes: number): boolean =>
  slot !== null && new Date(slot).getTime() - minutes * 60_000 - Date.now() >= MIN_REMINDER_GAP_MS;

interface PickerState {
  service: string;
  date: string | null;
  slot: string | null;
  lead: number | null;
}

function settleLead(options: number[], slot: string | null, lead: number | null): number | null {
  let next = lead;
  if (slot && !reminderFeasible(slot, next ?? 0)) next = options.find((m) => reminderFeasible(slot, m)) ?? null;
  if (!next) next = options.find((m) => !slot || reminderFeasible(slot, m)) ?? null;
  return next;
}

export interface Picker {
  state: PickerState;
  slots: string[] | null;
  value: PickerValue | null;
  firstSlot: string | null;
  selectService: (service: string) => void;
  selectDate: (key: string) => void;
  selectSlot: (iso: string) => void;
  selectLead: (minutes: number) => void;
  pickFirst: () => Promise<void>;
  reset: () => void;
}

const initialState = (config: AppConfig): PickerState => ({
  service: config.services[0] ?? '',
  date: null,
  slot: null,
  lead: settleLead(config.reminderOptions, null, null),
});

export function usePicker(config: AppConfig, excludeId?: string): Picker {
  const { attempt } = useToast();
  const [state, setState] = useState<PickerState>(() => initialState(config));
  const [generation, setGeneration] = useState(0);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [first, setFirst] = useState<{ key: string; iso: string } | null>(null);
  const latestDate = useRef<string | null>(null);

  const loadSlots = useCallback(
    async (key: string): Promise<string[] | null> => {
      const query = excludeId ? `&exclude=${encodeURIComponent(excludeId)}` : '';
      const result = await attempt(() => api<SlotsResponse>(`/api/slots?date=${key}${query}`));
      return result.ok ? result.value.slots : null;
    },
    [attempt, excludeId],
  );

  const chooseDate = useCallback(
    async (key: string, preloaded?: string[]): Promise<string[] | null> => {
      latestDate.current = key;
      setState((s) => ({ ...s, date: key, slot: null, lead: settleLead(config.reminderOptions, null, s.lead) }));
      setSlots(null);
      const loaded = preloaded ?? (await loadSlots(key));
      if (loaded === null || latestDate.current !== key) return null;
      setSlots(loaded);
      return loaded;
    },
    [config.reminderOptions, loadSlots],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: generation restarts the search after a reset
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const key of config.days) {
        const open = await loadSlots(key);
        if (cancelled) return;
        const earliest = open?.[0];
        if (open && earliest) {
          setFirst({ key, iso: earliest });
          await chooseDate(key, open);
          return;
        }
      }
      const fallback = config.days[0];
      if (fallback) await chooseDate(fallback);
    })();
    return () => {
      cancelled = true;
    };
  }, [config.days, loadSlots, chooseDate, generation]);

  const selectSlot = useCallback(
    (iso: string) => setState((s) => ({ ...s, slot: iso, lead: settleLead(config.reminderOptions, iso, s.lead) })),
    [config.reminderOptions],
  );

  const pickFirst = useCallback(async () => {
    if (!first) return;
    const iso = (await chooseDate(first.key))?.[0];
    if (iso) selectSlot(iso);
  }, [first, chooseDate, selectSlot]);

  const reset = useCallback(() => {
    latestDate.current = null;
    setState(initialState(config));
    setSlots(null);
    setFirst(null);
    setGeneration((n) => n + 1);
  }, [config]);

  const value = useMemo<PickerValue | null>(
    () => (state.slot && state.lead ? { service: state.service, startsAt: state.slot, reminderMinutes: state.lead } : null),
    [state],
  );

  return {
    state,
    slots,
    value,
    firstSlot: first?.iso ?? null,
    selectService: (service) => setState((s) => ({ ...s, service })),
    selectDate: (key) => {
      void chooseDate(key);
    },
    selectSlot,
    selectLead: (minutes) => setState((s) => ({ ...s, lead: minutes })),
    pickFirst,
    reset,
  };
}
