/**
 * A short, professional message the DRIVER can copy to a broker.
 *
 * Built from a template, not generated: it only ever contains facts the
 * driver gave us and the ASK the calculator produced, so it cannot invent a
 * pickup time, an MC number or a promise. It never mentions the walk-away
 * number (that is the driver's private floor) and never accepts the load.
 *
 * English only, as the product spec asks -- US brokers work in English
 * regardless of the driver's own language.
 */

import type { FreightAnalysis } from "./analyze";
import { placeLabel } from "./load-facts";
import { miles, money, perMile } from "./numbers";

type OkAnalysis = Extract<FreightAnalysis, { status: "OK" }>;

export function brokerMessage(analysis: OkAnalysis): string {
  const facts = analysis.facts;
  const greeting = facts.brokerContact ? `Hi ${facts.brokerContact.split(/\s+/)[0]},` : "Hi,";
  const from = placeLabel(facts.origin);
  const to = placeLabel(facts.destination);
  const lane = from && to ? `the ${from} to ${to} load` : "this load";
  const reference = facts.reference ? ` (ref ${facts.reference})` : "";
  const e = analysis.estimate;
  const n = analysis.negotiation;

  const milesLine =
    e.deadheadPickupMiles > 0
      ? `With ${miles(e.deadheadPickupMiles)} empty to the pickup it's ${miles(e.totalMiles)} total for my truck.`
      : `That's ${miles(e.totalMiles)} for my truck.`;

  const rateLine =
    analysis.hasOffer && !n.counterNeeded
      ? `I'm interested at ${money(analysis.facts.grossRate ?? 0)}.`
      : analysis.hasOffer
        ? `I can cover it at ${money(n.ask.rate)} (${perMile(n.ask.perLoadedMile)}/loaded mi).`
        : `My rate for it is ${money(n.ask.rate)} (${perMile(n.ask.perLoadedMile)}/loaded mi).`;

  return [
    greeting,
    `Following up on ${lane}${reference}. ${milesLine}`,
    rateLine,
    "If that works, send the rate confirmation and I'll get my packet over. Thanks!",
  ].join("\n");
}
