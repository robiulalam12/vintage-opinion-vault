import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ urls: z.array(z.string().url()).min(1).max(25) });

export const getReviewTexts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const { fetchReviewTexts } = await import("./review-age.server");
    return { results: await fetchReviewTexts(data.urls) };
  });
