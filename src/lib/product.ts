/**
 * OnRoad Books is sold as an owner-operator product: one owner, one truck
 * (ADR 0031). The Fleet surface -- several units, the Fleet page, the Fleet
 * plan, driver pay statements -- stays in the code but is not shown. Turning
 * this on brings it back without restoring anything else.
 *
 * Team invites are not behind this switch: they still follow the plan (a
 * complimentary Fleet grant), which is how an accountant is given access.
 */
export const FLEET_VISIBLE = false;
