import { z } from "zod";

const informationIdSchema = z.string().trim().min(1).max(200);

export const userInformationListQuerySchema = z.object({
  state: z.literal("unread").default("unread"),
  cursor: z.string().trim().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  include: z.literal("summary").optional(),
}).strict();

export const userInformationPathSchema = z.object({
  id: informationIdSchema,
}).strict();

export const userInformationAckSchema = z.object({
  informationIds: z.array(informationIdSchema).min(1).max(100),
}).strict();
