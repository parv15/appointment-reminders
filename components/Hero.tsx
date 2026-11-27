import { cssVars } from '@/lib/client/css';

interface Props {
  nextLabel: string | null;
  onNext: () => void;
}

export function Hero({ nextLabel, onNext }: Props) {
  return (
    <section className="band pad hero">
      <div className="rise" style={cssVars({ '--d': 0 })}>
        <p className="eyebrow">Online booking</p>
        <h1 style={{ marginTop: 14 }}>
          Book an
          <br />
          appointment
        </h1>
      </div>
      <div className="hero-side rise" style={cssVars({ '--d': 2 })}>
        <p className="lede">
          Pick a time and we will text you a confirmation straight away. A reminder follows before you arrive, and you can reply to it to confirm or to ask for a new time.
        </p>
        {nextLabel && (
          <button type="button" className="next-pill" onClick={onNext}>
            <span className="dot" />
            <span>{nextLabel}</span>
            <span className="go">&rarr;</span>
          </button>
        )}
      </div>
    </section>
  );
}
