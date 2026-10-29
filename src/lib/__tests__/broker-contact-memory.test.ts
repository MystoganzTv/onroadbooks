import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { unsavedContactNames, withContactName } from "../broker-contacts";
import { rememberBrokerContact } from "../remember-broker-contact";
import type { Repository } from "../db/repository";
import type { Broker, BrokerContact, Dataset } from "../types";

const contact = (name: string): BrokerContact => ({ id: `bc_${name}`, name, phone: null, phoneExtension: null, email: null, notes: null });

describe("broker contacts from loads", () => {
  it("lists the people on a broker's loads who are not saved contacts, once each", () => {
    const names = unsavedContactNames([contact("Ana Ruiz")], [
      { brokerContact: "Jackson Bradley" }, { brokerContact: " jackson bradley " }, { brokerContact: "ana ruiz" }, { brokerContact: null },
    ]);
    assert.deepEqual(names, ["Jackson Bradley"]);
  });

  it("adds a name only when it is new", () => {
    assert.equal(withContactName([contact("Ana Ruiz")], "x", " ANA RUIZ "), null);
    assert.deepEqual(withContactName([contact("Ana Ruiz")], "x", "Jackson Bradley")?.map((row) => row.name), ["Ana Ruiz", "Jackson Bradley"]);
  });

  it("saving a load remembers its contact under the broker's profile, and nothing without a profile", async () => {
    const saved: BrokerContact[][] = [];
    const tql = { id: "b1", name: "TQL", nameKey: "tql", contacts: [contact("Ana Ruiz")] } as unknown as Broker;
    const repository = {
      getDataset: async () => ({ brokers: [tql] }) as unknown as Dataset,
      saveBrokerContacts: async (_id: string, rows: BrokerContact[]) => { saved.push(rows); return tql; },
    } as unknown as Repository;
    await rememberBrokerContact(repository, { broker: "tql", brokerContact: "Jackson Bradley" });
    assert.deepEqual(saved[0].map((row) => row.name), ["Ana Ruiz", "Jackson Bradley"]);
    await rememberBrokerContact(repository, { broker: "TQL", brokerContact: "Ana Ruiz" });
    await rememberBrokerContact(repository, { broker: "Curri", brokerContact: "Someone" });
    await rememberBrokerContact(repository, { broker: "TQL", brokerContact: "" });
    assert.equal(saved.length, 1);
  });
});
