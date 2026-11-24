/**
 * Countries and location resolution for the Job Scanner. Sources state
 * locations as free text ("Berlin (Hybrid)", "Remote - EMEA", "London, UK");
 * this module maps them to ISO country codes with a transparent lookup: country
 * names and aliases first, then a gazetteer of well-known cities. A location
 * that cannot be mapped stays unresolved; it is never guessed.
 */

const ISO_CODES =
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KR KW KZ LA LB LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PR PT PY QA RO RS RU RW SA SC SD SE SG SI SK SL SM SN SO SR SV SY SZ TD TG TH TJ TM TN TR TT TW TZ UA UG US UY UZ VE VN YE ZA ZM ZW".split(
    " ",
  );

/** Names shown in the interface where they differ from the platform's region names. */
const NAME_OVERRIDES: Record<string, string> = {
  CZ: "Czech Republic",
  TR: "Turkey",
  HK: "Hong Kong",
  MO: "Macau",
  CD: "Congo (DRC)",
  CG: "Congo (Republic)",
};

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = ISO_CODES.map((code) => ({
  code,
  name: NAME_OVERRIDES[code] ?? displayNames.of(code) ?? code,
})).sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function isCountryCode(value: string): boolean {
  return COUNTRY_BY_CODE.has(value);
}

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRY_BY_CODE.get(code)?.name ?? code;
}

/** Other spellings a source may use for a country. Keys are normalised (see `normalizePlace`). */
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "GB",
  "u.k.": "GB",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  "united kingdom of great britain and northern ireland": "GB",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  us: "US",
  "united states of america": "US",
  america: "US",
  uae: "AE",
  "u.a.e.": "AE",
  emirates: "AE",
  holland: "NL",
  "the netherlands": "NL",
  nederland: "NL",
  deutschland: "DE",
  czechia: "CZ",
  "czech republic": "CZ",
  "republic of ireland": "IE",
  eire: "IE",
  schweiz: "CH",
  suisse: "CH",
  osterreich: "AT",
  espana: "ES",
  italia: "IT",
  polska: "PL",
  sverige: "SE",
  danmark: "DK",
  norge: "NO",
  suomi: "FI",
  belgie: "BE",
  belgique: "BE",
  turkiye: "TR",
  turkey: "TR",
  "south korea": "KR",
  korea: "KR",
  russia: "RU",
  vietnam: "VN",
  "hong kong": "HK",
  "new zealand": "NZ",
  aotearoa: "NZ",
};

/**
 * Well-known cities, mainly in the countries people relocate to for work.
 * Where a name exists in several countries the most common reading is listed
 * and a US state or Canadian province next to it overrides it ("Cambridge, Massachusetts").
 */
const CITIES: Record<string, string[]> = {
  DE: [
    "berlin",
    "munich",
    "munchen",
    "hamburg",
    "frankfurt",
    "frankfurt am main",
    "cologne",
    "koln",
    "stuttgart",
    "dusseldorf",
    "leipzig",
    "dresden",
    "nuremberg",
    "nurnberg",
    "hanover",
    "hannover",
    "bremen",
    "essen",
    "dortmund",
    "bonn",
    "karlsruhe",
    "mannheim",
    "heidelberg",
    "darmstadt",
    "aachen",
    "munster",
    "freiburg",
    "potsdam",
    "kiel",
    "mainz",
    "wiesbaden",
    "augsburg",
    "regensburg",
    "bochum",
    "duisburg",
    "wuppertal",
    "bielefeld",
    "chemnitz",
    "erfurt",
    "jena",
    "magdeburg",
    "rostock",
    "kassel",
    "saarbrucken",
    "ulm",
    "wolfsburg",
    "braunschweig",
    "ingolstadt",
    "paderborn",
    "walldorf",
    "kempten",
    "leonberg",
    "erlangen",
    "wurzburg",
    "oldenburg",
    "osnabruck",
    "lubeck",
    "halle",
    "koblenz",
    "trier",
    "konstanz",
    "tubingen",
    "gottingen",
    "garching",
    "unterfohring",
    "parsdorf",
  ],
  NL: [
    "amsterdam",
    "rotterdam",
    "the hague",
    "den haag",
    "utrecht",
    "eindhoven",
    "groningen",
    "delft",
    "leiden",
    "haarlem",
    "nijmegen",
    "tilburg",
    "breda",
    "arnhem",
    "maastricht",
    "amersfoort",
    "hoofddorp",
    "zwolle",
    "enschede",
    "almere",
    "veldhoven",
    "hilversum",
    "s-hertogenbosch",
    "den bosch",
  ],
  AT: ["vienna", "wien", "graz", "linz", "salzburg", "innsbruck", "klagenfurt"],
  SE: ["stockholm", "gothenburg", "goteborg", "malmo", "uppsala", "lund", "linkoping", "vasteras", "umea"],
  DK: ["copenhagen", "kobenhavn", "aarhus", "odense", "aalborg", "lyngby"],
  GB: [
    "london",
    "manchester",
    "edinburgh",
    "glasgow",
    "birmingham",
    "bristol",
    "leeds",
    "cambridge",
    "oxford",
    "liverpool",
    "newcastle",
    "sheffield",
    "nottingham",
    "cardiff",
    "belfast",
    "brighton",
    "reading",
    "southampton",
    "bath",
    "york",
    "aberdeen",
    "solihull",
    "milton keynes",
    "leicester",
    "coventry",
  ],
  IE: ["dublin", "cork", "galway", "limerick", "waterford"],
  PL: ["warsaw", "warszawa", "krakow", "cracow", "wroclaw", "gdansk", "poznan", "lodz", "katowice", "gdynia", "lublin"],
  CZ: ["prague", "praha", "brno", "ostrava", "plzen", "pilsen"],
  EE: ["tallinn", "tartu"],
  BE: ["brussels", "brussel", "bruxelles", "antwerp", "antwerpen", "ghent", "gent", "leuven", "liege", "bruges"],
  NO: ["oslo", "bergen", "trondheim", "stavanger"],
  LU: ["luxembourg city", "esch-sur-alzette"],
  CH: ["zurich", "geneva", "geneve", "basel", "bern", "lausanne", "zug", "lugano", "winterthur", "st. gallen"],
  CA: [
    "toronto",
    "vancouver",
    "montreal",
    "ottawa",
    "calgary",
    "edmonton",
    "waterloo",
    "kitchener",
    "quebec city",
    "winnipeg",
    "halifax",
    "mississauga",
  ],
  NZ: ["auckland", "wellington", "christchurch", "hamilton", "dunedin"],
  AE: ["dubai", "abu dhabi", "sharjah"],
  SG: ["singapore"],
  QA: ["doha", "lusail"],
  FR: [
    "paris",
    "lyon",
    "marseille",
    "toulouse",
    "bordeaux",
    "nantes",
    "lille",
    "nice",
    "grenoble",
    "strasbourg",
    "montpellier",
    "rennes",
    "sophia antipolis",
    "orly",
  ],
  ES: ["madrid", "barcelona", "valencia", "seville", "sevilla", "malaga", "bilbao", "zaragoza"],
  PT: ["lisbon", "lisboa", "porto", "braga", "coimbra"],
  IT: ["milan", "milano", "rome", "roma", "turin", "torino", "bologna", "florence", "naples"],
  FI: ["helsinki", "espoo", "tampere", "turku", "oulu"],
  GR: ["athens", "thessaloniki"],
  HU: ["budapest"],
  RO: ["bucharest", "bucuresti", "cluj-napoca", "cluj", "timisoara", "iasi"],
  BG: ["sofia", "plovdiv", "varna"],
  LT: ["vilnius", "kaunas"],
  LV: ["riga"],
  HR: ["zagreb", "split"],
  RS: ["belgrade", "novi sad"],
  SK: ["bratislava", "kosice"],
  SI: ["ljubljana"],
  UA: ["kyiv", "kiev", "lviv"],
  TR: ["istanbul", "ankara", "izmir"],
  IL: ["tel aviv", "tel aviv-yafo", "jerusalem", "haifa", "herzliya"],
  IN: [
    "bangalore",
    "bengaluru",
    "hyderabad",
    "mumbai",
    "pune",
    "chennai",
    "gurugram",
    "gurgaon",
    "new delhi",
    "delhi",
    "noida",
    "kolkata",
    "ahmedabad",
  ],
  US: [
    "new york",
    "new york city",
    "nyc",
    "san francisco",
    "seattle",
    "boston",
    "chicago",
    "austin",
    "los angeles",
    "denver",
    "atlanta",
    "washington",
    "washington dc",
    "miami",
    "san diego",
    "san jose",
    "palo alto",
    "mountain view",
    "sunnyvale",
    "foster city",
    "menlo park",
    "redmond",
    "portland",
    "dallas",
    "houston",
    "philadelphia",
    "pittsburgh",
    "raleigh",
    "salt lake city",
    "phoenix",
    "minneapolis",
    "detroit",
    "brooklyn",
    "santa clara",
    "cupertino",
    "bellevue",
  ],
  AU: ["sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"],
  JP: ["tokyo", "osaka", "kyoto", "yokohama"],
  CN: ["shanghai", "beijing", "shenzhen", "guangzhou", "hangzhou"],
  KR: ["seoul", "busan"],
  TW: ["taipei"],
  BR: ["sao paulo", "rio de janeiro", "florianopolis", "belo horizonte", "sao jose dos campos", "curitiba"],
  MX: ["mexico city", "guadalajara", "monterrey"],
  AR: ["buenos aires", "cordoba"],
  CL: ["santiago"],
  CO: ["bogota", "medellin"],
  ZA: ["cape town", "johannesburg"],
  EG: ["cairo"],
  NG: ["lagos"],
  KE: ["nairobi"],
  SA: ["riyadh", "jeddah"],
  AM: ["yerevan"],
  GE: ["tbilisi"],
  MY: ["kuala lumpur"],
  TH: ["bangkok"],
  VN: ["ho chi minh city", "hanoi"],
  ID: ["jakarta"],
  PH: ["manila"],
  CY: ["limassol", "nicosia"],
  MT: ["valletta"],
  IS: ["reykjavik"],
};

/** A US state after a city name means the US city of that name ("Cambridge, Massachusetts"). */
const US_STATES = new Set(
  "alabama alaska arizona arkansas california colorado connecticut delaware florida hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada ohio oklahoma oregon pennsylvania tennessee texas utah vermont virginia wisconsin wyoming ca ny tx wa il fl nc va oh nj az ut md dc mn tn"
    .split(" ")
    .concat([
      "new hampshire",
      "new jersey",
      "new mexico",
      "new york",
      "north carolina",
      "north dakota",
      "rhode island",
      "south carolina",
      "south dakota",
      "west virginia",
      "washington",
    ]),
);

/** Canadian provinces: "London, Ontario" is in Canada. */
const CA_PROVINCES = new Set([
  "ontario",
  "quebec",
  "british columbia",
  "alberta",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "new brunswick",
  "qc",
  "bc",
]);

/**
 * ISO codes accepted as the last part of a location ("Berlin, DE"). Codes that
 * are also US state abbreviations or everyday words are left out.
 */
const TRAILING_CODES = new Set("nl se dk gb ie pl cz ee be lu ch nz ae sg qa fr es pt fi at de".split(" "));

const EUROPE =
  "AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA".split(
    " ",
  );
const EU = "AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(" ");

/** Regions a remote posting may name instead of a country. `*` means anywhere. */
const REGIONS: Array<{ id: string; pattern: RegExp; countries: string[] | "*" }> = [
  { id: "worldwide", pattern: /\b(worldwide|world wide|anywhere|global|globally|international)\b/, countries: "*" },
  { id: "eu", pattern: /\b(eu|european union|eea|schengen)\b/, countries: [...EU, "NO", "IS", "LI", "CH"] },
  { id: "europe", pattern: /\b(europe|european|emea)\b/, countries: EUROPE },
  { id: "dach", pattern: /\bdach\b/, countries: ["DE", "AT", "CH"] },
  { id: "nordics", pattern: /\b(nordics?|scandinavia)\b/, countries: ["SE", "DK", "NO", "FI", "IS"] },
  { id: "benelux", pattern: /\bbenelux\b/, countries: ["BE", "NL", "LU"] },
  {
    id: "north_america",
    pattern: /\b(north america|americas|us timezones?|usa timezones?)\b/,
    countries: ["US", "CA", "MX"],
  },
  {
    id: "apac",
    pattern: /\b(apac|asia[- ]pacific)\b/,
    countries: ["SG", "NZ", "AU", "JP", "KR", "IN", "HK", "MY", "TH", "VN", "ID", "PH", "TW"],
  },
  { id: "middle_east", pattern: /\b(middle east|mena|gcc)\b/, countries: ["AE", "QA", "SA", "KW", "BH", "OM"] },
];

/** Lower-case, strip accents and punctuation that does not carry meaning. */
export function normalizePlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ø/gi, "o")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COUNTRY_LOOKUP = new Map<string, string>();
for (const country of COUNTRIES) COUNTRY_LOOKUP.set(normalizePlace(country.name), country.code);
for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) COUNTRY_LOOKUP.set(alias, code);

const CITY_LOOKUP = new Map<string, string>();
for (const [code, cities] of Object.entries(CITIES)) {
  for (const city of cities) if (!CITY_LOOKUP.has(city)) CITY_LOOKUP.set(city, code);
}

/** Words around a place name that say how the work is arranged, not where. */
const NOISE =
  /\b(remote job|remote|hybrid|on-?site|in-?office|office|hq|headquarters|hub|home[- ]based|based|area|greater|metropolitan|region|city centre|city center|or|and|flexible|distributed)\b/g;

export interface LocationResolution {
  /** ISO codes of every country the location names, in order of appearance. */
  countries: string[];
  /** The first recognised city, as written by the source. */
  city: string | null;
  /** Region ids the location names ("europe", "worldwide"). */
  regions: string[];
  /** Whether the location text itself says the job is remote. */
  remote: boolean;
}

/**
 * Map a source's location text (and any structured country names it provides)
 * to countries, a city and regions. Unknown text resolves to nothing.
 */
export function resolveLocation(raw: string, hints: string[] = []): LocationResolution {
  const countries: string[] = [];
  const regions: string[] = [];
  let city: string | null = null;
  const add = (code: string | null | undefined) => {
    if (code && !countries.includes(code)) countries.push(code);
  };
  const addRegions = (value: string) => {
    for (const region of REGIONS)
      if (region.pattern.test(value) && !regions.includes(region.id)) regions.push(region.id);
  };

  for (const hint of hints) {
    const value = hint.trim();
    if (!value) continue;
    if (/^[A-Z]{2}$/.test(value) && isCountryCode(value)) add(value);
    else add(COUNTRY_LOOKUP.get(normalizePlace(value)));
    addRegions(normalizePlace(value));
  }

  const text = normalizePlace(raw);
  const remote = /\b(remote|home[- ]based|work from home|distributed|anywhere)\b/.test(text);
  addRegions(text);

  // "Berlin, Germany; Helsinki, Finland" and "Amsterdam | Madrid" list several places.
  for (const part of text.split(/[;|/\n]|\s+or\s+|\s+&\s+/)) {
    const tokens = part
      .replace(/[()[\]]/g, ",")
      .split(/,|\s-\s|\s–\s|:/)
      .map((token) => token.replace(NOISE, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (tokens.length === 0) continue;
    const cityToken = tokens.find((token) => CITY_LOOKUP.has(token));
    const cityCountry = cityToken ? (CITY_LOOKUP.get(cityToken) ?? null) : null;
    const rest = tokens.filter((token) => token !== cityToken);
    const inUsState = rest.some((token) => US_STATES.has(token));
    const inCaProvince = rest.some((token) => CA_PROVINCES.has(token));

    let stated: string | null = null;
    for (const token of rest.length > 0 ? rest : tokens) {
      const code = COUNTRY_LOOKUP.get(token) ?? null;
      // "Atlanta, Georgia" is the US state, not the country.
      if (code === "GE" && cityCountry === "US") continue;
      if (code) {
        stated = stated ?? code;
        add(code);
      }
    }
    const last = tokens[tokens.length - 1];
    if (!stated && tokens.length > 1 && TRAILING_CODES.has(last) && !(last === "de" && cityCountry === "US")) {
      stated = last.toUpperCase();
      add(stated);
    }

    if (cityToken && cityCountry) {
      if (!city) city = titleCase(cityToken);
      // The stated country wins over the gazetteer; a state or province disambiguates the city.
      if (!stated) add(inUsState ? "US" : inCaProvince ? "CA" : cityCountry);
    } else if (!stated && tokens.length > 1) {
      if (inUsState) add("US");
      else if (inCaProvince) add("CA");
    }
  }

  return { countries, city, regions, remote };
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Countries a set of region ids covers; `null` means every country. */
export function regionCountries(regionIds: string[]): string[] | null {
  const covered = new Set<string>();
  for (const id of regionIds) {
    const region = REGIONS.find((item) => item.id === id);
    if (!region) continue;
    if (region.countries === "*") return null;
    for (const code of region.countries) covered.add(code);
  }
  return [...covered];
}

export interface CountryMatch {
  matches: boolean;
  /** The selected country the listing was matched to, when one was resolved. */
  countryCode: string | null;
  /** Why the listing was kept or dropped (for scan diagnostics). */
  reason: "any_country" | "country" | "remote_region" | "other_country" | "unresolved";
}

/**
 * Decide whether a listing is in one of the selected countries. A listing
 * matches when its location names a selected country (or a known city in one).
 * A remote listing also matches when the region it is open to covers a selected
 * country. Anything else, including a location that cannot be resolved, does
 * not match: only listings known to be in the configured locations are kept.
 */
export function matchCountries(
  resolution: LocationResolution,
  selected: string[],
  options: { remote: boolean },
): CountryMatch {
  if (selected.length === 0) {
    return { matches: true, countryCode: resolution.countries[0] ?? null, reason: "any_country" };
  }
  const direct = resolution.countries.find((code) => selected.includes(code));
  if (direct) return { matches: true, countryCode: direct, reason: "country" };
  if (resolution.countries.length > 0) return { matches: false, countryCode: null, reason: "other_country" };
  if (options.remote && resolution.regions.length > 0) {
    const covered = regionCountries(resolution.regions);
    if (covered === null || covered.some((code) => selected.includes(code))) {
      return { matches: true, countryCode: null, reason: "remote_region" };
    }
    return { matches: false, countryCode: null, reason: "other_country" };
  }
  return { matches: false, countryCode: null, reason: "unresolved" };
}
