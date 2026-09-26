import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
export const brokerSchema = z.object({
  name: z.string().trim().min(1, "Enter the broker's name").max(120),
  contactName: optionalText(120).optional(),
  phone: optionalText(60),
  phoneExtension: optionalText(20).optional(),
  email: z.union([z.string().trim().email("Enter a valid email").max(254), z.literal(""), z.null()]).transform((value) => value || null).optional(),
  mcNumber: optionalText(40),
  address: optionalText(500),
  notes: optionalText(4000),
});

const email = z.union([z.string().trim().email("Enter a valid email").max(254), z.literal(""), z.null()]).transform((value) => value || null);

/** One person at a broker. */
export const brokerContactSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1, "Enter the contact's name").max(120),
  phone: optionalText(60),
  phoneExtension: optionalText(20),
  email,
  notes: optionalText(2000),
});

export const brokerContactsSchema = z.array(brokerContactSchema).max(100).superRefine((contacts, context) => {
  const seen = new Set<string>();
  contacts.forEach((contact, index) => {
    const key = contact.name.trim().toLowerCase();
    if (seen.has(key)) context.addIssue({ code: "custom", path: [index, "name"], message: "That contact is already on this broker." });
    seen.add(key);
  });
});
