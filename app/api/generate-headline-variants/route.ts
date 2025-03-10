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

const extractedHeadlineWithLocationSchema = z.object({
  text: z.string().describe("The actual headline text"),
  type: z.string().describe(
    "The type of headline (e.g., 'tagline', 'cta', 'title')",
  ),
  bounding_box: z.object({
    top_left: z.array(z.number()).describe(
      "The top left coordinates of the bounding box",
    ),
    top_right: z.array(z.number()).describe(
      "The top right coordinates of the bounding box",
    ),
    bottom_right: z.array(z.number()).describe(
      "The bottom right coordinates of the bounding box",
    ),
    bottom_left: z.array(z.number()).describe(
      "The bottom left coordinates of the bounding box",
    ),
    center: z.array(z.number()).describe(
      "The center coordinates of the bounding box",
    ),
    width: z.number().describe("The width of the bounding box"),
    height: z.number().describe("The height of the bounding box"),
  }),
  area: z.number().describe("The area of the bounding box"),
  aspect_ratio: z.number().describe("The aspect ratio of the bounding box"),
});

const extractedHeadlinesWithLocationSchemaArray = z.array(
  extractedHeadlineWithLocationSchema,
).describe("List of headlines found in the image with their locations");

const extractedHeadlinesWithLocationSchema = z.object({
  headlines: extractedHeadlinesWithLocationSchemaArray,
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

  bounding_box: z.object({
    top_left: z.array(z.number()).describe(
      "The top left coordinates of the bounding box",
    ),
    top_right: z.array(z.number()).describe(
      "The top right coordinates of the bounding box",
    ),
    bottom_right: z.array(z.number()).describe(
      "The bottom right coordinates of the bounding box",
    ),
    bottom_left: z.array(z.number()).describe(
      "The bottom left coordinates of the bounding box",
    ),
    center: z.array(z.number()).describe(
      "The center coordinates of the bounding box",
    ),
    width: z.number().describe("The width of the bounding box"),
    height: z.number().describe("The height of the bounding box"),
  }),
  area: z.number().describe("The area of the bounding box"),
  aspect_ratio: z.number().describe("The aspect ratio of the bounding box"),

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

type FlorenceOCRResult = {
  text: string;
  bounding_box: {
    top_left: [number, number];
    top_right: [number, number];
    bottom_right: [number, number];
    bottom_left: [number, number];
    center: [number, number];
    width: number;
    height: number;
  };
  area: number;
  aspect_ratio: number;
};

// Hardcoded user ID for development
const HARDCODED_USER_ID = "97d82337-5d25-4258-b47f-5be8ea53114c";

async function extractHeadlines(
  imageUrl: string,
): Promise<z.infer<typeof extractedHeadlinesWithLocationSchemaArray>> {
  async function extractHeadlinesWithGPT(
    imageUrl: string,
  ): Promise<z.infer<typeof headlineExtractionSchemaArray>> {
    console.log("Extracting headlines with GPT...");
    const response = await openai.beta.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `You are an expert at analyzing ad headlines and their visual context. Your task is to identify and extract headlines from the provided ad image URL.
  
  For each headline found, provide:
  1. The exact text of the headline
  2. The type of headline (e.g., tagline, call-to-action, title)
  3. A description of its visual context (where it appears, styling, etc.)
  
  Focus on headlines that are prominent and serve a clear purpose in the ad.
  If no headlines are found in the image, return an empty list.`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
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

  async function extractHeadlinesWithFlorence(
    imageUrl: string,
  ): Promise<FlorenceOCRResult[]> {
    console.log("Extracting headlines with Florence...");

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ocr/detect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ image_url: imageUrl }),
        },
      );
      const data = await response.json();
      return data as FlorenceOCRResult[];
    } catch (error) {
      console.error("Error extracting headlines with Florence:", error);
      throw error;
    }
  }

  const [gptHeadlines, florenceHeadlines] = await Promise.all([
    extractHeadlinesWithGPT(imageUrl),
    extractHeadlinesWithFlorence(imageUrl),
  ]);

  console.log("GPT Headlines:", gptHeadlines);
  console.log("Florence Headlines:", florenceHeadlines);

  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          `You are an expert at analyzing and reconciling text extracted from images using different methods. Your task is to compare and merge text extracted by GPT (which is generally more accurate in text content) with text extracted by Florence OCR (which provides precise bounding boxes but may have text accuracy or segmentation issues).

Rules for reconciliation:
1. Use GPT's text as the primary source of truth for the actual text content
2. Use Florence's bounding boxes when there's a clear match between GPT and Florence text
3. For cases where Florence has split a single text block into multiple segments:
   - Identify segments that should be merged based on GPT's output
   - Combine the bounding boxes by:
     * Using the leftmost coordinates for left bounds
     * Using the rightmost coordinates for right bounds
     * Using the topmost coordinates for top bounds
     * Using the bottommost coordinates for bottom bounds
4. Discard any text regions that appear in only one of the sources (must be present in both)
5. If Florence's text is slightly inaccurate but clearly corresponds to GPT's text (based on position and partial match), use GPT's text with Florence's bounding box

Your output should maintain only the text entries that have both accurate text (from GPT) and valid bounding boxes (from Florence, merged if necessary).`,
      },
      {
        role: "user",
        content: `GPT Extracted Text:
${gptHeadlines.join("\n")}

Florence OCR Results (with bounding boxes):
${florenceHeadlines.map((result) => JSON.stringify(result)).join("\n")}

Merge these results following the system instructions.`,
      },
    ],
    response_format: zodResponseFormat(
      extractedHeadlinesWithLocationSchema,
      "headlines",
    ),
    temperature: 0,
  });

  const extractedHeadlines = response.choices[0].message.parsed;
  if (!extractedHeadlines || !extractedHeadlines.headlines) {
    throw new Error("No headlines in response");
  }

  return extractedHeadlines.headlines;
}

// Update metrics schema to include reasons
const metricsSchema = z.object({
  overall_success_likelihood: z.object({
    metric: z.number().describe(
      "Predicted likelihood of success as a percentage between 0-100",
    ),
    reason: z.string().describe(
      "Markdown-formatted explanation citing relevant data points",
    ),
  }),
  predicted_impressions: z.object({
    metric: z.number().describe("Predicted number of impressions"),
    reason: z.string().describe(
      "Markdown-formatted explanation citing relevant data points",
    ),
  }),
  predicted_clicks: z.object({
    metric: z.number().describe("Predicted number of clicks"),
    reason: z.string().describe(
      "Markdown-formatted explanation citing relevant data points",
    ),
  }),
  predicted_ctr: z.object({
    metric: z.number().describe("Predicted click-through rate as a percentage"),
    reason: z.string().describe(
      "Markdown-formatted explanation citing relevant data points",
    ),
  }),
  predicted_conversions: z.object({
    metric: z.number().describe("Predicted number of conversions"),
    reason: z.string().describe(
      "Markdown-formatted explanation citing relevant data points",
    ),
  }),
}).describe(
  "Predicted performance metrics for the headline variant with explanations",
);

const metricsResponseSchema = z.object({
  metrics: metricsSchema,
}).describe("Response containing predicted metrics");

async function generateMetricsPredictions(
  variant: z.infer<typeof headlineVariantSchema>,
  adData: AdVariantItem,
) {
  console.log("Generating metrics predictions for variant:", variant.original);
  // Fetch sample metrics data
  const { data: metricsData, error: metricsError } = await supabase
    .from("enhanced_ad_metrics")
    .select(`
      impressions,
      clicks,
      ctr,
      conversions,
      demographics
    `)
    .limit(10)
    .order("id", { ascending: false, nullsFirst: false });

  if (metricsError) {
    console.error("Error fetching metrics data:", metricsError);
    throw metricsError;
  }

  // If we need true randomness, we can shuffle the results in JavaScript
  const shuffledMetrics = metricsData
    ? [...metricsData].sort(() => Math.random() - 0.5)
    : [];

  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          `You are an expert at predicting ad performance metrics based on historical data and headline characteristics.
Your task is to analyze the provided headline variant and historical ad performance data to predict key metrics.

For each metric prediction, you must provide:
1. A numerical value based on the data
2. A detailed markdown-formatted explanation that cites:
   - Specific historical metrics that influenced the prediction
   - Relevant demographic patterns
   - Headline characteristics that impact the metric
   - Market research insights that support the prediction

Consider:
1. The headline's content, improvements, and target audience
2. Historical performance patterns from similar ads
3. The ad's market research data
4. Demographic engagement patterns

Provide realistic predictions that:
- Account for typical industry benchmarks
- Consider the specific improvements made in the variant
- Factor in the target audience and pain points addressed
- Align with historical performance patterns

Format your explanations in markdown with clear sections, bullet points, and data citations.`,
      },
      {
        role: "user",
        content:
          `Generate performance predictions with detailed explanations for this headline variant:

Headline Variant:
${JSON.stringify(variant)}

Ad Market Research:
${
            JSON.stringify(
              {
                intent_summary: adData.mr_intent_summary,
                target_audience: adData.mr_target_audience,
                pain_points: adData.mr_pain_points,
              },
            )
          }

Historical Metrics Sample:
${JSON.stringify(shuffledMetrics, null, 2)}

Predict realistic performance metrics and provide detailed explanations citing the data above.`,
      },
    ],
    response_format: zodResponseFormat(metricsResponseSchema, "metrics"),
    temperature: 0.3,
  });

  const predictions = response.choices[0].message.parsed?.metrics;
  if (!predictions) {
    throw new Error("No predictions in response");
  }
  console.log("Got metrics response", predictions);

  return predictions;
}

async function generateHeadlineVariants(
  originalHeadlines: z.infer<typeof extractedHeadlinesWithLocationSchemaArray>,
  adData: AdVariantItem,
  contentRules: z.infer<typeof contentRuleSchema>[],
) {
  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          `You are an expert at generating rule-compliant ad headlines. Create ONE optimized variant per headline that MUST follow all content rules.

Key Requirements:
1. Verify EVERY content rule before generating variants
2. Create exactly ONE variant per headline that:
   - Follows ALL content rules without exception
   - Maintains original intent and context
   - Improves effectiveness
3. Include concise documentation of:
   - Key improvements
   - Target audience alignment
   - Pain points addressed
   - Rule compliance verification

NO variant should be output unless it passes ALL rule checks.`,
      },
      {
        role: "user",
        content: `Generate rule-compliant variants for these headlines:

Headlines:
${JSON.stringify(originalHeadlines, null, 2)}

Market Context:
${
          JSON.stringify(
            {
              intent: adData.mr_intent_summary,
              audience: adData.mr_target_audience,
              pain_points: adData.mr_pain_points,
              stage: adData.mr_buying_stage,
              features: adData.mr_key_features,
              advantages: adData.mr_competitive_advantages,
            },
            null,
            2,
          )
        }

Required Rules (MUST follow ALL):
${JSON.stringify(contentRules, null, 2)}

Create ONE variant per headline. Each MUST comply with ALL rules.`,
      },
    ],
    response_format: zodResponseFormat(headlineVariantsSchema, "variants"),
    temperature: 0.7,
  });

  const variants = response.choices[0].message.parsed?.variants;
  if (!variants) {
    throw new Error("No variants in response");
  }

  // Generate metrics predictions for each variant
  const variantsWithMetrics = await Promise.all(
    variants.map(async (variant) => {
      const metrics = await generateMetricsPredictions(variant, adData);
      return {
        ...variant,
        overall_success_likelihood: metrics.overall_success_likelihood,
        predicted_impressions: metrics.predicted_impressions,
        predicted_clicks: metrics.predicted_clicks,
        predicted_ctr: metrics.predicted_ctr,
        predicted_conversions: metrics.predicted_conversions,
      };
    }),
  );

  console.log("Finished generating variants with metrics");

  return variantsWithMetrics;
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

    // Check if any headlines were found
    if (extractedHeadlines.length === 0) {
      console.log("No headlines found in the image");
      return NextResponse.json(
        { error: "No headlines found in the image" },
        { status: 400 },
      );
    }

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

    // Calculate aggregate metrics across all variants
    const aggregateMetrics = variants.reduce((acc, variant) => {
      return {
        overall_success_likelihood: {
          metric: Math.max(
            acc.overall_success_likelihood?.metric || 0,
            variant.overall_success_likelihood?.metric || 0,
          ),
          reason: variant.overall_success_likelihood?.reason || "",
        },
        predicted_impressions: {
          metric: Math.round(
            (acc.predicted_impressions?.metric || 0) +
              (variant.predicted_impressions?.metric || 0),
          ),
          reason: [
            acc.predicted_impressions?.reason || "",
            variant.predicted_impressions?.reason || "",
          ].filter(Boolean).join("\n\n"),
        },
        predicted_clicks: {
          metric: Math.round(
            (acc.predicted_clicks?.metric || 0) +
              (variant.predicted_clicks?.metric || 0),
          ),
          reason: [
            acc.predicted_clicks?.reason || "",
            variant.predicted_clicks?.reason || "",
          ].filter(Boolean).join("\n\n"),
        },
        predicted_ctr: {
          metric: Number(
            (((acc.predicted_clicks?.metric || 0) +
              (variant.predicted_clicks?.metric || 0)) /
              ((acc.predicted_impressions?.metric || 1) +
                (variant.predicted_impressions?.metric || 1)) *
              100).toFixed(2),
          ),
          reason: [
            acc.predicted_ctr?.reason || "",
            variant.predicted_ctr?.reason || "",
          ].filter(Boolean).join("\n\n"),
        },
        predicted_conversions: {
          metric: Math.round(
            (acc.predicted_conversions?.metric || 0) +
              (variant.predicted_conversions?.metric || 0),
          ),
          reason: [
            acc.predicted_conversions?.reason || "",
            variant.predicted_conversions?.reason || "",
          ].filter(Boolean).join("\n\n"),
        },
      };
    }, {} as {
      overall_success_likelihood: { metric: number; reason: string };
      predicted_impressions: { metric: number; reason: string };
      predicted_clicks: { metric: number; reason: string };
      predicted_ctr: { metric: number; reason: string };
      predicted_conversions: { metric: number; reason: string };
    });

    // 4. Store the results in Supabase with metrics
    console.log("Step 4: Storing results in Supabase...");
    const { error: insertError } = await supabase
      .from("headline_variants")
      .insert({
        user_id: HARDCODED_USER_ID,
        image_url: imageUrl,
        rules_used: contentRules || [],
        original_headlines: extractedHeadlines,
        new_headlines: variants,
        overall_success_likelihood: aggregateMetrics.overall_success_likelihood,
        predicted_impressions: aggregateMetrics.predicted_impressions,
        predicted_clicks: aggregateMetrics.predicted_clicks,
        predicted_ctr: aggregateMetrics.predicted_ctr,
        predicted_conversions: aggregateMetrics.predicted_conversions,
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
