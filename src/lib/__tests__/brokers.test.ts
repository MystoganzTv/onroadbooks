import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brokerContactsOf, mergeContacts, planBrokerMerge, planNameIntoBroker } from "../brokers";
import { brokerContactNames } from "../broker-contacts";
import type { Broker } from "../types";

const broker = (over: Partial<Broker>): Broker => ({
  id: "b1", businessId: "biz", name: "TQL", nameKey: "tql", contactName: null, phone: null,
  phoneExtension: null, email: null, mcNumber: null, address: null, notes: null, contacts: [],
  createdAt: "2026-09-25T00:00:00.000Z", ...over,
});

describe("broker contacts", () => {
  it("reads a legacy single contact as the first person, keeping its extension", () => {
    const legacy = broker({ contactName: " Christopher Sanchez ", phone: "800-580-3101", phoneExtension: "36438", email: "c@tql.test" });
    assert.deepEqual(brokerContactsOf(legacy), [{
      id: "bc_b1", name: "Christopher Sanchez", phone: "800-580-3101", phoneExtension: "36438", email: "c@tql.test", notes: null,
    }]);
    assert.deepEqual(brokerContactsOf(broker({})), []);
  });

  it("prefers saved contacts over the legacy field", () => {
    const row = broker({ contactName: "Old", contacts: [{ id: "x", name: "New", phone: null, phoneExtension: null, email: null, notes: null }] });
    assert.deepEqual(brokerContactsOf(row).map((c) => c.name), ["New"]);
  });

  it("merges people by name and fills blanks without overwriting", () => {
    const merged = mergeContacts(
      [{ id: "a", name: "Branden", phone: "1", phoneExtension: null, email: null, notes: "Days" }],
      [
        { id: "b", name: "branden", phone: "2", phoneExtension: "44", email: "b@x.test", notes: "Nights" },
        { id: "c", name: "Michael", phone: null, phoneExtension: null, email: null, notes: null },
      ],
    );
    assert.deepEqual(merged, [
      { id: "a", name: "Branden", phone: "1", phoneExtension: "44", email: "b@x.test", notes: "Days\n\nNights" },
      { id: "c", name: "Michael", phone: null, phoneExtension: null, email: null, notes: null },
    ]);
  });

  it("turns a profile named after a person into a contact of the company", () => {
    const source = broker({ id: "s", name: "Michael Ruiz", nameKey: "michael ruiz", phone: "800-580-3101", phoneExtension: "5", notes: "Load 9" });
    const target = broker({ id: "t", phone: "800-580-3101", notes: "Main office" });
    const plan = planBrokerMerge(source, target);
    assert.deepEqual(plan.target.contacts.map((c) => [c.name, c.phoneExtension]), [["Michael Ruiz", "5"]]);
    assert.equal(plan.loadContact, "Michael Ruiz");
    assert.equal(plan.target.notes, "Main office\n\nLoad 9");
  });

  it("does not guess a load contact when the source had several people", () => {
    const source = broker({ id: "s", name: "TQL Dallas", contacts: [
      { id: "1", name: "A", phone: null, phoneExtension: null, email: null, notes: null },
      { id: "2", name: "B", phone: null, phoneExtension: null, email: null, notes: null },
    ] });
    assert.equal(planBrokerMerge(source, broker({ id: "t" })).loadContact, null);
  });

  it("suggests every saved person for the load form", () => {
    const row = broker({ contacts: [
      { id: "1", name: "Michael", phone: null, phoneExtension: null, email: null, notes: null },
      { id: "2", name: "Branden", phone: null, phoneExtension: null, email: null, notes: null },
    ] });
    assert.deepEqual(brokerContactNames([{ broker: "tql", brokerContact: "Christopher" }], [row]), { tql: ["Branden", "Christopher", "Michael"] });
  });

  it("turns a load-only name into a contact of the chosen broker", () => {
    const target = broker({ contacts: [{ id: "c", name: "Christopher Sanchez", phone: null, phoneExtension: "36438", email: null, notes: null }] });
    const plan = planNameIntoBroker(" Michael Reagan ", target);
    assert.deepEqual(plan.target.contacts.map((c) => c.name), ["Christopher Sanchez", "Michael Reagan"]);
    assert.equal(plan.loadContact, "Michael Reagan");
  });
});
