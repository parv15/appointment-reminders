import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { cssVars } from '@/lib/client/css';

function Roll({ text }: { text: string }) {
  const chars = [...text];
  return (
    <span className="roll" aria-hidden="true">
      {chars.map((char, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: characters repeat and the list never reorders
        <span key={i} className="c" data-c={char} style={cssVars({ '--i': i })}>
          {char}
        </span>
      ))}
    </span>
  );
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { text: string };

export function RollButton({ text, className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className={`btn ${className}`.trim()} aria-label={text}>
      <Roll text={text} />
    </button>
  );
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & { text: string; href: string };

export function RollLink({ text, href, className = '', ...rest }: LinkProps) {
  return (
    <a {...rest} href={href} className={`btn ${className}`.trim()} aria-label={text}>
      <Roll text={text} />
    </a>
  );
}
