export function Diagram() {
  return (
    <svg className="diagram" viewBox="0 0 900 290" aria-hidden="true">
      <defs>
        <radialGradient id="sph" cx="32%" cy="28%" r="80%">
          <stop offset="0" stopColor="#7aa2ff"/>
          <stop offset="0.55" stopColor="#266df0"/>
          <stop offset="1" stopColor="#1a47b5"/>
        </radialGradient>
        <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1" fill="#fff" opacity="0.45"/></pattern>
      </defs>

      <path className="wire" d="M86 145H118"/>
      <path className="wire" d="M238 145C282 145 282 47 320 47"/>
      <path className="wire" d="M238 145H320"/>
      <path className="wire" d="M238 145C282 145 282 243 320 243"/>
      <path className="wire" d="M590 47C620 47 620 145 646 145"/>
      <path className="wire" d="M590 145H646"/>
      <path className="wire" d="M590 243C620 243 620 145 646 145"/>
      <path className="wire" d="M726 145H784"/>
      <path className="flow" d="M86 145H118"/>
      <path className="flow" d="M238 145C282 145 282 47 320 47"/>
      <path className="flow slow" d="M238 145H320"/>
      <path className="flow slow" d="M238 145C282 145 282 243 320 243"/>
      <path className="flow" d="M590 47C620 47 620 145 646 145"/>
      <path className="flow slow" d="M590 145H646"/>
      <path className="flow slow" d="M590 243C620 243 620 145 646 145"/>
      <path className="flow" d="M726 145H784"/>

      <g className="on"><rect className="card-rect" x="10" y="107" width="76" height="76" rx="14"/></g>
      <rect x="34" y="131" width="28" height="26" rx="4" className="glyph"/>
      <path className="glyph" d="M34 139H62M42 148l4 4 8-8"/>

      <rect className="pill-rect" x="118" y="132" width="120" height="26" rx="13"/>
      <text className="pill-text" x="178" y="149" textAnchor="middle">booking.created</text>

      <g className="on"><rect className="card-rect" x="320" y="15" width="270" height="64" rx="12"/></g>
      <rect className="card-rect" x="320" y="113" width="270" height="64" rx="12"/>
      <rect className="card-rect" x="320" y="211" width="270" height="64" rx="12"/>

      <rect className="pill-rect" x="332" y="27" width="40" height="40" rx="9"/>
      <rect className="glyph" x="342" y="39" width="20" height="14" rx="4"/>
      <path className="glyph" d="M347 53l-2 5 7-5"/>
      <text className="label" x="388" y="44">Confirmation text</text>
      <text className="sub" x="388" y="60">Sent as soon as you book</text>

      <rect className="pill-rect" x="332" y="125" width="40" height="40" rx="9"/>
      <circle className="glyph" cx="352" cy="145" r="9"/>
      <path className="glyph" d="M352 139v6l4 3"/>
      <text className="label" x="388" y="142">Reminder text</text>
      <text className="sub" x="388" y="158">Sent at the time you choose</text>

      <rect className="pill-rect" x="332" y="223" width="40" height="40" rx="9"/>
      <path className="glyph" d="M360 238h-6a6 6 0 0 0 0 12h6M357 234l-4 4 4 4"/>
      <text className="label" x="388" y="240">Your reply</text>
      <text className="sub" x="388" y="256">Reply C or R to answer</text>

      <rect className="pill-rect" x="646" y="132" width="80" height="26" rx="13"/>
      <text className="pill-text" x="686" y="149" textAnchor="middle">Deliver</text>

      <circle cx="814" cy="145" r="30" fill="url(#sph)"/>
      <circle cx="814" cy="145" r="30" fill="url(#dots)"/>
      <rect className="pill-rect" x="789" y="185" width="50" height="24" rx="12"/>
      <text className="pill-text" x="814" y="201" textAnchor="middle">You</text>
    </svg>
  );
}
