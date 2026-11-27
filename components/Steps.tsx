import { cssVars } from '@/lib/client/css';

const STEPS = ['Service and time', 'Your details', 'Confirmed'];

export function Steps({ current, finished }: { current: 1 | 2 | 3; finished: boolean }) {
  return (
    <section className="band tight">
      <ol className="steps rise" style={cssVars({ '--d': 3 })} aria-label="Progress">
        {STEPS.map((text, i) => {
          const n = i + 1;
          const state = n < current || (n === 3 && finished) ? 'done' : n === current ? 'current' : undefined;
          return (
            <li key={text} className={state}>
              <span>{n}</span>
              {text}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
