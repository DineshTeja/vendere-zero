import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Define the schema for headline extraction
const extractedHeadlineSchema = z.object({
  text: z.string().describe("The actual headline text"),
  type: z.string().describe(
    "The type of headline (e.g., 'tagline', 'cta', 'title')",
  ),
  visual_context: z.string().describe(
    "Description of where and how the headline appears visually",
  ),
});

const headlineExtractionSchemaArray = z.array(extractedHeadlineSchema).describe(
  "List of headlines found in the image",
);

const headlineExtractionSchema = z.object({
  headlines: headlineExtractionSchemaArray,
});

// Define the schema for content rules
export const contentRuleSchema = z.object({
  type: z.string().describe(
    "The type of rule (e.g., 'tone', 'formatting', 'keyword')",
  ),
  name: z.string().describe("The name of the rule"),
  description: z.string().describe(
    "Detailed explanation of the rule's purpose and application",
  ),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]).describe(
    "The value of the rule, which can be a string, number, boolean, array of strings, or a formatting object with specific properties",
  ),
});

// Define the schema for headline variants
const headlineVariantSchema = z.object({
  text: z.string().describe("The new headline text"),
  type: z.string().describe(
    "The type of headline (e.g., 'tagline', 'cta', 'title')",
  ),
  visual_context: z.string().describe(
    "Description of where and how the headline appears visually",
  ),
  original: z.string().describe(
    "The original headline that this is a variant of",
  ),
  improvements: z.array(z.string()).describe(
    "List of improvements made to the original",
  ),
  expected_impact: z.array(z.string()).describe(
    "Expected impact of these changes",
  ),
  target_audience: z.array(z.string()).describe(
    "Target audience segments for this variant",
  ),
  pain_points_addressed: z.array(z.string()).describe(
    "Pain points that this variant addresses",
  ),
});

const headlineVariantsArraySchema = z.array(headlineVariantSchema).describe(
  "List of generated headline variants",
);

const headlineVariantsSchema = z.object({
  variants: headlineVariantsArraySchema,
});

// Type for the RPC function result
type AdVariantItem = {
  mr_id: string;
  mr_user_id: string;
  mr_image_url: string;
  mr_created_at: string;
  mr_intent_summary: string;
  mr_target_audience: Record<string, unknown>;
  mr_pain_points: Record<string, unknown>;
  mr_buying_stage: string;
  mr_key_features: Record<string, unknown>;
  mr_competitive_advantages: Record<string, unknown>;
  mr_perplexity_insights: string;
  mr_citations: string[];
  mr_keywords: {
    keyword: string;
    intent_reflected: string;
    likelihood_score: number;
  }[];
  mr_original_headlines: Record<string, unknown>[];
  mr_new_headlines: Record<string, unknown>[];
  li_id: string;
  li_type: string;
  li_name: string;
  li_description: string;
  li_user_id: string;
  li_created_at: string;
  li_item_id: string;
  li_features: string[];
  li_sentiment_tones: string[];
  li_avg_sentiment_confidence: number;
  li_preview_url: string;
};

// Hardcoded user ID for development
const HARDCODED_USER_ID = "97d82337-5d25-4258-b47f-5be8ea53114c";

async function extractHeadlines(imageUrl: string) {
  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          `You are an expert at analyzing ad headlines and their visual context. Your task is to identify and extract headlines from the provided ad image URL.

For each headline found, provide:
1. The exact text of the headline
2. The type of headline (e.g., tagline, call-to-action, title)
3. A description of its visual context (where it appears, styling, etc.)

Focus on headlines that are prominent and serve a clear purpose in the ad.

Image URL to analyze: ${imageUrl}`,
      },
    ],
    response_format: zodResponseFormat(headlineExtractionSchema, "headlines"),
    temperature: 0.3,
  });

  const headlines = response.choices[0].message.parsed?.headlines;
  if (!headlines) {
    throw new Error("No headlines in response");
  }

  return headlines as z.infer<typeof headlineExtractionSchemaArray>;
}

async function generateHeadlineVariants(
  originalHeadlines: Array<
    { text: string; type: string; visual_context: string }
  >,
  adData: AdVariantItem,
  contentRules: z.infer<typeof contentRuleSchema>[],
) {
  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          `You are an expert at generating optimized ad headlines. Your task is to create variants of the provided headlines while considering:
1. The original headlines and their context
2. The ad's market research data and target audience
3. The provided content rules and guidelines

For each variant:
- Maintain the original's intent while improving its effectiveness
- Consider the visual context and placement
- Explain improvements and expected impact
- Align with target audience and address pain points
- Follow all provided content rules`,
      },
      {
        role: "user",
        content: `Generate optimized variants for these headlines:

Original Headlines:
${JSON.stringify(originalHeadlines, null, 2)}

Ad Market Research:
${
          JSON.stringify(
            {
              intent_summary: adData.mr_intent_summary,
              target_audience: adData.mr_target_audience,
              pain_points: adData.mr_pain_points,
              buying_stage: adData.mr_buying_stage,
              key_features: adData.mr_key_features,
              competitive_advantages: adData.mr_competitive_advantages,
            },
            null,
            2,
          )
        }

Content Rules to Follow:
${JSON.stringify(contentRules, null, 2)}

Generate 2-3 variants for each headline that follow the content rules and leverage the market research data.`,
      },
    ],
    response_format: zodResponseFormat(headlineVariantsSchema, "variants"),
    temperature: 0.7,
  });

  const variants = response.choices[0].message.parsed?.variants;
  if (!variants) {
    throw new Error("No variants in response");
  }

  return variants as z.infer<typeof headlineVariantsArraySchema>;
}

export async function POST(request: Request) {
  try {
    console.log("Starting headline variant generation process...");

    // Parse request body
    const { imageUrl, contentRules } = await request.json();
    console.log("Input received:", {
      imageUrl,
      rulesCount: contentRules?.length ?? 0,
    });

    if (!imageUrl) {
      console.log("Error: No image URL provided");
      return NextResponse.json(
        { error: "Image URL is required" },
        { status: 400 },
      );
    }

    // 1. Extract headlines from the image
    console.log("Step 1: Extracting headlines from image...");
    const extractedHeadlines = await extractHeadlines(imageUrl);
    console.log(
      "Extracted headlines:",
      JSON.stringify(extractedHeadlines, null, 2),
    );

    // 2. Get ad data from Supabase
    console.log("Step 2: Fetching ad data from Supabase...");
    const { data: adData, error: adError } = await supabase
      .rpc("join_market_research_and_library_items")
      .eq("mr_image_url", imageUrl)
      .single();

    if (adError) {
      console.error("Error fetching ad data:", adError);
      return NextResponse.json(
        { error: "Failed to fetch ad data" },
        { status: 500 },
      );
    }

    const typedAdData = adData as AdVariantItem;
    console.log("Ad data fetched successfully:", {
      id: typedAdData.mr_id,
      intent: typedAdData.mr_intent_summary?.slice(0, 100) + "...",
      targetAudience: typedAdData.mr_target_audience,
    });

    // 3. Generate headline variants
    console.log("Step 3: Generating headline variants...");
    const variants = await generateHeadlineVariants(
      extractedHeadlines,
      typedAdData,
      contentRules || [],
    );
    console.log("Generated variants:", JSON.stringify(variants, null, 2));

    // 4. Store the results in Supabase
    console.log("Step 4: Storing results in Supabase...");
    const { error: insertError } = await supabase
      .from("headline_variants")
      .insert({
        user_id: HARDCODED_USER_ID,
        image_url: imageUrl,
        rules_used: contentRules || [],
        original_headlines: extractedHeadlines,
        new_headlines: variants,
      });

    if (insertError) {
      console.error("Error storing headline variants:", insertError);
      return NextResponse.json(
        { error: "Failed to store headline variants" },
        { status: 500 },
      );
    }
    console.log("Successfully stored results in Supabase");

    console.log("Process completed successfully");
    return NextResponse.json({
      success: true,
      original_headlines: extractedHeadlines,
      variants: variants,
    });
  } catch (error) {
    console.error("Error in headline variant generation process:", error);
    return NextResponse.json(
      { error: "Failed to generate headline variants" },
      { status: 500 },
    );
  }
}
