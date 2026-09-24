import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
export const brokerSchema = z.object({
  name: z.string().trim().min(1, "Enter the broker's name").max(120),
  contactName: optionalText(120),
  phone: optionalText(60),
  email: z.union([z.string().trim().email("Enter a valid email").max(254), z.literal(""), z.null()]).transform((value) => value || null),
  mcNumber: optionalText(40),
  address: optionalText(500),
  notes: optionalText(4000),
});
