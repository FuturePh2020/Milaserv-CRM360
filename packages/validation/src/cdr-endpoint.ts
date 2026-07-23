/**
 * Classifies a Yeastar CDR "Call From"/"Call To" endpoint string (spec
 * section 16.2). Observed real forms in docs/samples/yeastar_cdr_sample.xls:
 * - "Abdelmagied Ali<7033>"       -> human agent, extension 7033
 * - "IVR Duty Hours - AR_EN<6234>" -> system endpoint, not an Agent
 * - "Queue Tele<...>"              -> system endpoint, not an Agent
 * - "Voicemail Mohamed Saad<1067>" -> system endpoint (voicemail), not an Agent
 * - "0536366684"                   -> a customer phone number, no extension
 */
export interface ParsedCdrEndpoint {
  raw: string;
  name: string | null;
  extension: string | null;
  isSystemEndpoint: boolean;
  isPhoneNumberShaped: boolean;
}

const SYSTEM_ENDPOINT_KEYWORDS = ["IVR", "QUEUE", "VOICEMAIL"];

export function parseCdrEndpoint(rawInput: string): ParsedCdrEndpoint {
  const raw = rawInput.trim();

  const namedMatch = raw.match(/^(.*?)<(\d+)>$/);
  if (namedMatch) {
    const name = namedMatch[1].trim();
    const extension = namedMatch[2];
    const isSystemEndpoint = SYSTEM_ENDPOINT_KEYWORDS.some((keyword) =>
      name.toUpperCase().includes(keyword),
    );
    return { raw, name, extension, isSystemEndpoint, isPhoneNumberShaped: false };
  }

  const digitsOnly = raw.replace(/[^\d]/g, "");
  const isPhoneNumberShaped = digitsOnly.length >= 7 && digitsOnly === raw.replace(/^\+/, "");

  return { raw, name: null, extension: null, isSystemEndpoint: false, isPhoneNumberShaped };
}
