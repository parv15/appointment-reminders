interface Country {
  code: string;
  name: string;
  groups: readonly number[];
  label?: string;
}

const COUNTRIES: readonly Country[] = [
  { code: '+1', name: 'US / Canada', label: 'United States', groups: [3, 3, 4] },
  { code: '+7', name: 'Russia / Kazakhstan', label: 'Russia', groups: [3, 3, 2, 2] },
  { code: '+20', name: 'Egypt', groups: [2, 4, 4] },
  { code: '+27', name: 'South Africa', groups: [2, 3, 4] },
  { code: '+30', name: 'Greece', groups: [3, 3, 4] },
  { code: '+31', name: 'Netherlands', groups: [1, 4, 4] },
  { code: '+32', name: 'Belgium', groups: [3, 2, 2, 2] },
  { code: '+33', name: 'France', groups: [1, 2, 2, 2, 2] },
  { code: '+34', name: 'Spain', groups: [3, 3, 3] },
  { code: '+36', name: 'Hungary', groups: [2, 3, 4] },
  { code: '+39', name: 'Italy', groups: [3, 3, 4] },
  { code: '+40', name: 'Romania', groups: [3, 3, 3] },
  { code: '+41', name: 'Switzerland', groups: [2, 3, 2, 2] },
  { code: '+43', name: 'Austria', groups: [3, 4, 4] },
  { code: '+44', name: 'United Kingdom', groups: [4, 6] },
  { code: '+45', name: 'Denmark', groups: [2, 2, 2, 2] },
  { code: '+46', name: 'Sweden', groups: [2, 3, 2, 2] },
  { code: '+47', name: 'Norway', groups: [3, 2, 3] },
  { code: '+48', name: 'Poland', groups: [3, 3, 3] },
  { code: '+49', name: 'Germany', groups: [4, 7] },
  { code: '+51', name: 'Peru', groups: [3, 3, 3] },
  { code: '+52', name: 'Mexico', groups: [2, 4, 4] },
  { code: '+54', name: 'Argentina', groups: [2, 4, 4] },
  { code: '+55', name: 'Brazil', groups: [2, 5, 4] },
  { code: '+56', name: 'Chile', groups: [1, 4, 4] },
  { code: '+57', name: 'Colombia', groups: [3, 3, 4] },
  { code: '+58', name: 'Venezuela', groups: [3, 3, 4] },
  { code: '+60', name: 'Malaysia', groups: [2, 4, 4] },
  { code: '+61', name: 'Australia', groups: [3, 3, 3] },
  { code: '+62', name: 'Indonesia', groups: [3, 4, 4] },
  { code: '+63', name: 'Philippines', groups: [3, 3, 4] },
  { code: '+64', name: 'New Zealand', groups: [2, 3, 4] },
  { code: '+65', name: 'Singapore', groups: [4, 4] },
  { code: '+66', name: 'Thailand', groups: [2, 3, 4] },
  { code: '+81', name: 'Japan', groups: [2, 4, 4] },
  { code: '+82', name: 'South Korea', groups: [2, 4, 4] },
  { code: '+84', name: 'Vietnam', groups: [2, 3, 4] },
  { code: '+86', name: 'China', groups: [3, 4, 4] },
  { code: '+90', name: 'Turkey', groups: [3, 3, 4] },
  { code: '+92', name: 'Pakistan', groups: [3, 7] },
  { code: '+93', name: 'Afghanistan', groups: [2, 3, 4] },
  { code: '+94', name: 'Sri Lanka', groups: [2, 3, 4] },
  { code: '+95', name: 'Myanmar', groups: [2, 3, 4] },
  { code: '+98', name: 'Iran', groups: [3, 3, 4] },
  { code: '+212', name: 'Morocco', groups: [3, 3, 3] },
  { code: '+213', name: 'Algeria', groups: [3, 2, 2, 2] },
  { code: '+216', name: 'Tunisia', groups: [2, 3, 3] },
  { code: '+233', name: 'Ghana', groups: [2, 3, 4] },
  { code: '+234', name: 'Nigeria', groups: [3, 3, 4] },
  { code: '+254', name: 'Kenya', groups: [3, 3, 3] },
  { code: '+255', name: 'Tanzania', groups: [3, 3, 3] },
  { code: '+256', name: 'Uganda', groups: [3, 3, 3] },
  { code: '+351', name: 'Portugal', groups: [3, 3, 3] },
  { code: '+352', name: 'Luxembourg', groups: [3, 3, 3] },
  { code: '+353', name: 'Ireland', groups: [2, 3, 4] },
  { code: '+354', name: 'Iceland', groups: [3, 4] },
  { code: '+358', name: 'Finland', groups: [2, 3, 4] },
  { code: '+359', name: 'Bulgaria', groups: [3, 3, 3] },
  { code: '+370', name: 'Lithuania', groups: [3, 2, 3] },
  { code: '+371', name: 'Latvia', groups: [2, 3, 3] },
  { code: '+372', name: 'Estonia', groups: [4, 4] },
  { code: '+380', name: 'Ukraine', groups: [2, 3, 4] },
  { code: '+385', name: 'Croatia', groups: [2, 3, 4] },
  { code: '+420', name: 'Czech Republic', groups: [3, 3, 3] },
  { code: '+421', name: 'Slovakia', groups: [3, 3, 3] },
  { code: '+852', name: 'Hong Kong', groups: [4, 4] },
  { code: '+880', name: 'Bangladesh', groups: [4, 6] },
  { code: '+886', name: 'Taiwan', groups: [3, 3, 3] },
  { code: '+960', name: 'Maldives', groups: [3, 4] },
  { code: '+961', name: 'Lebanon', groups: [2, 3, 3] },
  { code: '+962', name: 'Jordan', groups: [1, 4, 4] },
  { code: '+966', name: 'Saudi Arabia', groups: [2, 3, 4] },
  { code: '+971', name: 'United Arab Emirates', groups: [2, 3, 4] },
  { code: '+972', name: 'Israel', groups: [2, 3, 4] },
  { code: '+973', name: 'Bahrain', groups: [4, 4] },
  { code: '+974', name: 'Qatar', groups: [4, 4] },
  { code: '+977', name: 'Nepal', groups: [3, 3, 4] },
];

const BY_LENGTH = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);

export interface CountryOption {
  code: string;
  label: string;
}

const optionLabel = (country: Country) => `${country.label ?? country.name} (${country.code})`;

export const COUNTRY_OPTIONS: readonly CountryOption[] = COUNTRIES.map((country) => ({
  code: country.code,
  label: optionLabel(country),
})).sort((a, b) => a.label.localeCompare(b.label));

export function countryOptions(defaultCode: string): readonly CountryOption[] {
  return COUNTRY_OPTIONS.some((option) => option.code === defaultCode) ? COUNTRY_OPTIONS : [{ code: defaultCode, label: defaultCode }, ...COUNTRY_OPTIONS];
}

const lookup = (e164: string): Country | undefined => BY_LENGTH.find((country) => e164.startsWith(country.code));

function group(digits: string, sizes: readonly number[]): string[] {
  const groups: string[] = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= digits.length) break;
    groups.push(digits.slice(at, at + size));
    at += size;
  }
  if (at < digits.length) groups.push(digits.slice(at));
  return groups;
}

export function formatPhone(e164: string): string {
  const country = lookup(e164);
  if (!country) return e164;
  return `${country.code} ${group(e164.slice(country.code.length), country.groups).join(' ')}`;
}

export function describePhone(e164: string): { formatted: string; country: string | null } {
  return { formatted: formatPhone(e164), country: lookup(e164)?.name ?? null };
}

export function normalizePhone(typed: string, code: string): string {
  const trimmed = typed.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return `${code}${digits.replace(/^0+/, '')}`;
}
