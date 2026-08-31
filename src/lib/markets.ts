export interface FreightMarket {
  key: string;
  label: string;
}

const MARKET_ALIASES: Record<string, string> = {
  "DC:WASHINGTON": "washington-dc",
  "VA:ALEXANDRIA": "washington-dc",
  "VA:ARLINGTON": "washington-dc",
  "VA:CHANTILLY": "washington-dc",
  "VA:FAIRFAX": "washington-dc",
  "VA:HERNDON": "washington-dc",
  "VA:MANASSAS": "washington-dc",
  "VA:RESTON": "washington-dc",
  "VA:STERLING": "washington-dc",
  "MD:BETHESDA": "washington-dc",
  "MD:FREDERICK": "washington-dc",
  "MD:ROCKVILLE": "washington-dc",
  "MD:BALTIMORE": "baltimore-md",
  "PA:PHILADELPHIA": "philadelphia-pa",
  "NJ:CAMDEN": "philadelphia-pa",
  "DE:WILMINGTON": "philadelphia-pa",
  "NJ:NEWARK": "new-york-north-jersey",
  "NJ:ELIZABETH": "new-york-north-jersey",
  "NJ:JERSEY CITY": "new-york-north-jersey",
  "NJ:KEARNY": "new-york-north-jersey",
  "NJ:LINDEN": "new-york-north-jersey",
  "NJ:SECAUCUS": "new-york-north-jersey",
  "NY:NEW YORK": "new-york-north-jersey",
  "PA:HARRISBURG": "harrisburg-pa",
  "PA:CARLISLE": "harrisburg-pa",
  "PA:YORK": "harrisburg-pa",
  "VA:RICHMOND": "richmond-va",
  "VA:WINCHESTER": "shenandoah-va",
  "GA:ATLANTA": "atlanta-ga",
  "GA:MARIETTA": "atlanta-ga",
  "GA:SAVANNAH": "savannah-ga",
  "IL:CHICAGO": "chicago-il",
  "IL:JOLIET": "chicago-il",
  "IN:GARY": "chicago-il",
  "TX:DALLAS": "dallas-fort-worth",
  "TX:FORT WORTH": "dallas-fort-worth",
  "TX:ARLINGTON": "dallas-fort-worth",
  "TX:HOUSTON": "houston-tx",
  "TX:SAN ANTONIO": "san-antonio-tx",
  "TX:AUSTIN": "austin-tx",
  "CA:LOS ANGELES": "los-angeles-ca",
  "CA:LONG BEACH": "los-angeles-ca",
  "CA:ONTARIO": "inland-empire-ca",
  "CA:RIVERSIDE": "inland-empire-ca",
  "CA:SAN BERNARDINO": "inland-empire-ca",
  "CA:OAKLAND": "san-francisco-bay-area",
  "CA:SAN FRANCISCO": "san-francisco-bay-area",
  "CA:SAN JOSE": "san-francisco-bay-area",
  "CA:SAN DIEGO": "san-diego-ca",
  "FL:MIAMI": "south-florida",
  "FL:FORT LAUDERDALE": "south-florida",
  "FL:WEST PALM BEACH": "south-florida",
  "FL:ORLANDO": "orlando-fl",
  "FL:TAMPA": "tampa-fl",
  "WA:SEATTLE": "seattle-tacoma",
  "WA:TACOMA": "seattle-tacoma",
  "TN:MEMPHIS": "memphis-tn",
  "TN:NASHVILLE": "nashville-tn",
  "KY:LOUISVILLE": "louisville-ky",
  "OH:COLUMBUS": "columbus-oh",
  "OH:CINCINNATI": "cincinnati-oh",
  "OH:CLEVELAND": "cleveland-oh",
  "MI:DETROIT": "detroit-mi",
  "MO:ST LOUIS": "st-louis-mo",
  "MO:KANSAS CITY": "kansas-city-mo",
  "KS:KANSAS CITY": "kansas-city-mo",
  "CO:DENVER": "denver-co",
  "AZ:PHOENIX": "phoenix-az",
  "NV:LAS VEGAS": "las-vegas-nv",
  "UT:SALT LAKE CITY": "salt-lake-city-ut",
};

const MARKET_LABELS: Record<string, string> = {
  "washington-dc": "Washington, DC",
  "baltimore-md": "Baltimore, MD",
  "philadelphia-pa": "Philadelphia, PA",
  "new-york-north-jersey": "New York / North Jersey",
  "harrisburg-pa": "Harrisburg, PA",
  "richmond-va": "Richmond, VA",
  "shenandoah-va": "Shenandoah Valley, VA",
  "atlanta-ga": "Atlanta, GA",
  "savannah-ga": "Savannah, GA",
  "chicago-il": "Chicago, IL",
  "dallas-fort-worth": "Dallas-Fort Worth, TX",
  "houston-tx": "Houston, TX",
  "san-antonio-tx": "San Antonio, TX",
  "austin-tx": "Austin, TX",
  "los-angeles-ca": "Los Angeles, CA",
  "inland-empire-ca": "Inland Empire, CA",
  "san-francisco-bay-area": "San Francisco Bay Area, CA",
  "san-diego-ca": "San Diego, CA",
  "south-florida": "South Florida",
  "orlando-fl": "Orlando, FL",
  "tampa-fl": "Tampa, FL",
  "seattle-tacoma": "Seattle-Tacoma, WA",
  "memphis-tn": "Memphis, TN",
  "nashville-tn": "Nashville, TN",
  "louisville-ky": "Louisville, KY",
  "columbus-oh": "Columbus, OH",
  "cincinnati-oh": "Cincinnati, OH",
  "cleveland-oh": "Cleveland, OH",
  "detroit-mi": "Detroit, MI",
  "st-louis-mo": "St. Louis, MO",
  "kansas-city-mo": "Kansas City, MO",
  "denver-co": "Denver, CO",
  "phoenix-az": "Phoenix, AZ",
  "las-vegas-nv": "Las Vegas, NV",
  "salt-lake-city-ut": "Salt Lake City, UT",
};

function normalizeCity(city: string): string {
  return city
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bSAINT\b/gi, "ST")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function titleCase(city: string): string {
  return city
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function freightMarket(city: string, state: string): FreightMarket {
  const normalizedState = state.trim().toUpperCase() || "??";
  const normalizedCity = normalizeCity(city) || "Unknown";
  const alias = MARKET_ALIASES[`${normalizedState}:${normalizedCity}`];
  if (alias) return { key: alias, label: MARKET_LABELS[alias] };
  const key = `${normalizedState}:${normalizedCity.toLowerCase().replaceAll(" ", "-")}`;
  return { key, label: `${titleCase(normalizedCity)}, ${normalizedState}` };
}
