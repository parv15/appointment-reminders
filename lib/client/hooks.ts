import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useToast } from '@/components/Toast';
import type { AppConfig } from './types';

export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

export function useConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const { attempt } = useToast();

  useEffect(() => {
    let cancelled = false;
    attempt(() => api<AppConfig>('/api/config')).then((result) => {
      if (result.ok && !cancelled) setConfig(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return config;
}

export function useFreshKeys(keys: string[]): ReadonlySet<string> {
  const seen = useRef(new Set<string>());
  const fresh = new Set(keys.filter((key) => !seen.current.has(key)));
  useEffect(() => {
    for (const key of keys) seen.current.add(key);
  });
  return fresh;
}
