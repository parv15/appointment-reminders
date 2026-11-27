const AVATAR = {
  backgrounds: ['#dbe7ff', '#ffe3d4', '#dff3e4', '#f3e1f5', '#fff0c9', '#d9f0f4'],
  skins: ['#f2c9a5', '#e0a97d', '#c68863', '#a46a47', '#7a4c33'],
  hair: ['#1d1512', '#4a2f1d', '#8a5a2b', '#c9a24b', '#9a3b2a', '#6b6b70'],
  shirts: ['#266df0', '#130f0c', '#2f8f5b', '#c4561c', '#7a4bc2', '#4b5563'],
};

const INK = '#130f0c';

export function Avatar({ name }: { name: string }) {
  let seed = 7;
  for (const char of name) seed = (seed * 31 + (char.codePointAt(0) ?? 0)) % 100003;
  const pick = (list: string[], shift: number) => list[Math.floor(seed / shift) % list.length];
  const style = Math.floor(seed / 11) % 4;
  const skin = pick(AVATAR.skins, 3);
  const hair = pick(AVATAR.hair, 5);

  return (
    <span className="avatar">
      <svg viewBox="0 0 40 40" width="40" height="40" role="img" aria-label={name}>
        <rect width="40" height="40" fill={pick(AVATAR.backgrounds, 1)} />
        {style === 1 && <path d="M9 34c-1-14 4-22 11-22s12 8 11 22z" fill={hair} />}
        <path d="M5 41c1-8 7-12 15-12s14 4 15 12z" fill={pick(AVATAR.shirts, 7)} />
        <rect x="17" y="22" width="6" height="8" rx="2" fill={skin} />
        <ellipse cx="20" cy="17" rx="7" ry="8" fill={skin} />
        {style === 0 && <path d="M12.5 16c0-6 3.5-8.5 7.5-8.5s7.5 2.5 7.5 8.5c-2-2.5-5-3.5-7.5-3.5S14.5 13.5 12.5 16z" fill={hair} />}
        {style === 1 && <path d="M12.5 17c0-6 3-9 7.5-9s7.5 3 7.5 9c-1.5-3-4-5-7.5-5s-6 2-7.5 5z" fill={hair} />}
        {style === 2 && (
          <>
            <path d="M12.8 15c.5-5 3.5-7 7.2-7s6.7 2 7.2 7c-2-1.8-4.5-2.5-7.2-2.5S14.8 13.2 12.8 15z" fill={hair} />
            <circle cx="20" cy="6.5" r="3.2" fill={hair} />
          </>
        )}
        {style === 3 && <path d="M13 14.5c1-4.5 4-6.5 7-6.5s6 2 7 6.5c-3-1-5-1.8-7-1.8s-4 .8-7 1.8z" fill={hair} />}
        <circle cx="17.2" cy="17.5" r="0.9" fill={INK} />
        <circle cx="22.8" cy="17.5" r="0.9" fill={INK} />
        <path d="M17.5 21c1.5 1.2 3.5 1.2 5 0" fill="none" stroke={INK} strokeWidth="0.9" strokeLinecap="round" />
      </svg>
    </span>
  );
}
