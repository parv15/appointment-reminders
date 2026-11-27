const DIAL_BY_COUNTRY: Record<string, string> = {
  US: '+1', CA: '+1', GB: '+44', IE: '+353', FR: '+33', DE: '+49', ES: '+34', IT: '+39', NL: '+31', BE: '+32', AT: '+43', CH: '+41',
  SE: '+46', NO: '+47', DK: '+45', FI: '+358', PL: '+48', PT: '+351', GR: '+30', CZ: '+420', HU: '+36', RO: '+40', TR: '+90',
  AE: '+971', SA: '+966', QA: '+974', KW: '+965', BH: '+973', OM: '+968', IL: '+972', EG: '+20', ZA: '+27', NG: '+234', KE: '+254',
  GH: '+233', BR: '+55', MX: '+52', AR: '+54', CL: '+56', CO: '+57', PE: '+51', JP: '+81', KR: '+82', CN: '+86', HK: '+852',
  TW: '+886', TH: '+66', MY: '+60', ID: '+62', PH: '+63', VN: '+84', SG: '+65', PK: '+92', BD: '+880', LK: '+94',
  NP: '+977', AU: '+61', NZ: '+64',
};

export function dialCodeOf(country: string): string | undefined {
  return DIAL_BY_COUNTRY[country.toUpperCase()];
}

export function servesDestination(country: string, phone: string): boolean {
  const code = dialCodeOf(country);
  return code !== undefined && phone.startsWith(code);
}
