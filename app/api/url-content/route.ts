import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Initialize Firecrawl
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

// Hardcoded user ID for development
const HARDCODED_USER_ID = "97d82337-5d25-4258-b47f-5be8ea53114c";

// Define types for Firecrawl responses
type FirecrawlCrawlResponse = {
  id: string;
  status: string;
};

type FirecrawlResultResponse = {
  status: string;
  data: Array<{
    markdown: string;
    url: string;
  }>;
};

// Add type for crawled URL structure
type CrawledUrl = {
  url: string;
  markdown_summary: string;
};

// Define the material schema for OpenAI's response using Zod
const contentRuleSchema = z.object({
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

const materialSchema = z.object({
  analysis: z.string()
    .describe(
      "A comprehensive markdown-formatted analysis of the content, including detailed sections on brand identity, strategic objectives, target audience analysis, value propositions, messaging frameworks, and any other relevant branding and strategy insights. This should be an extensive breakdown that can serve as a complete reference document.",
    ),
  content_rules: z.array(contentRuleSchema)
    .describe(
      "List of content rules extracted from the content for ensuring generated content abides by branding strategy",
    ),
  material_type: z.enum(["strategy", "branding", "guidelines"])
    .describe("The type of material based on its content"),
  tags: z.array(z.string())
    .describe("Keywords and categories that describe the content"),
  image_urls: z.array(z.string())
    .optional()
    .describe("URLs of images found in the content"),
});

async function createConsolidatedSummary(
  crawledUrls: CrawledUrl[],
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          `You are tasked with creating a comprehensive, extremely detailed summary of multiple related documents. 
Your goal is to consolidate the key information from all provided documents into a single, well-structured markdown summary.

Guidelines:
- Maintain the original markdown formatting where appropriate
- Preserve important headings and structure
- Eliminate redundant information
- Ensure the summary flows logically
- Keep all crucial branding and strategy information
- Include source URLs as references where relevant`,
      },
      {
        role: "user",
        content:
          `Here are the documents to consolidate, each with its source URL. Create a comprehensive summary that captures all key information:

${
            crawledUrls.map((url) => (
              `Source: ${url.url}\n\n${url.markdown_summary}\n\n---\n\n`
            )).join("")
          }`,
      },
    ],
    temperature: 0.3,
  });

  return response.choices[0].message.content || "";
}

async function scrapeUrlContent(
  url: string,
): Promise<{ mainContent: string; crawledUrls: CrawledUrl[] }> {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/crawl", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        limit: 10, // Get up to 10 pages
        maxDepth: 2, // Go 2 levels deep
        scrapeOptions: {
          formats: ["markdown"],
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to scrape URL");
    }

    const { id } = (await response.json()) as FirecrawlCrawlResponse;

    // Poll for results
    const result = await pollForResults(id);

    // Process all crawled URLs
    const crawledUrls: CrawledUrl[] = result.data.map((item) => ({
      url: item.url,
      markdown_summary: item.markdown,
    }));

    // Create a consolidated summary from all crawled content
    const mainContent = await createConsolidatedSummary(crawledUrls);

    return {
      mainContent,
      crawledUrls,
    };
  } catch (error) {
    console.error("Error scraping URL:", error);
    throw error;
  }
}

async function pollForResults(
  id: string,
  maxAttempts = 50,
): Promise<FirecrawlResultResponse> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `https://api.firecrawl.dev/v1/crawl/${id}`,
      {
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
      },
    );

    const data = (await response.json()) as FirecrawlResultResponse;

    if (data.status === "completed") {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
    attempts++;
  }

  throw new Error("Timeout waiting for crawl results");
}

async function processWithOpenAI(content: string) {
  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          `You are an expert at analyzing branding and strategy documents. Your task is to perform a comprehensive analysis of the provided content and structure it into a detailed markdown document. Your analysis should be extremely thorough and cover all aspects of branding and strategy found in the content.

FORMAT YOUR ANALYSIS IN MARKDOWN with the following sections (where applicable):

# Brand Identity Analysis
- Core brand values and principles
- Brand personality and character
- Brand promise and positioning
- Visual identity requirements and guidelines

# Strategic Framework
- Mission and vision statements
- Strategic objectives and goals
- Market positioning
- Competitive advantages

# Target Audience Analysis
- Primary and secondary audiences
- Audience demographics and psychographics
- Pain points and needs
- Customer journey touchpoints

# Messaging Framework
- Key messages and themes
- Tone of voice specifications
- Communication style guidelines
- Content type preferences

# Brand Expression Guidelines
- Language and terminology preferences
- Writing style requirements
- Content structure preferences
- Do's and don'ts

# Implementation Requirements
- Technical specifications
- Compliance requirements
- Quality control measures
- Performance metrics

Include specific examples, quotes, and references from the source material where relevant. Your analysis should serve as a comprehensive reference document that can guide content creation and brand consistency.

Additionally, extract content rules following this structure:
1. Each rule should have:
   - type: Category of the rule (e.g., 'tone', 'voice', 'formatting', 'keywords', 'compliance')
   - name: Clear, descriptive name of the rule
   - description: Detailed explanation of the rule's purpose and application
   - value: Can be one of:
     * String: For simple rules (e.g., "professional", "friendly")
     * Number: For numeric limits or thresholds
     * Boolean: For yes/no rules
     * Array of strings: For lists (e.g., keywords, phrases)
     * Object: For complex rules with multiple properties

Example rules:
{
  type: "tone",
  name: "Brand Voice Tone",
  description: "The overall tone to maintain in all communications",
  value: "professional"
}

{
  type: "keywords",
  name: "Core Brand Terms",
  description: "Essential brand keywords that should be consistently used",
  value: ["innovation", "reliability", "excellence"]
}

{
  type: "formatting",
  name: "Content Length Guidelines",
  description: "Specifications for content length across different formats",
  value: {
    "blog_posts": 1200,
    "social_media": 280,
    "product_descriptions": 500
  }
}`,
      },
      {
        role: "user",
        content: content,
      },
    ],
    response_format: zodResponseFormat(materialSchema, "material_info"),
    temperature: 0.3,
  });

  const result = response.choices[0].message.parsed;
  return result;
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 },
      );
    }

    // 1. Scrape the URL content and get all crawled URLs
    const { mainContent, crawledUrls } = await scrapeUrlContent(url);

    // 2. Process with OpenAI
    const processedData = await processWithOpenAI(mainContent);

    if (!processedData) {
      return NextResponse.json(
        { error: "Failed to process content" },
        { status: 500 },
      );
    }

    // 3. Store in Supabase with both summary and analysis
    const { error } = await supabase.from("materials").insert({
      user_id: HARDCODED_USER_ID,
      material_url: url,
      content_type: "url",
      summary: mainContent, // Raw Firecrawl output from main URL
      analysis: processedData.analysis, // Detailed OpenAI analysis
      content_rules: processedData.content_rules,
      material_type: processedData.material_type,
      tags: processedData.tags,
      image_urls: processedData.image_urls || [],
      crawled_urls: crawledUrls, // Store all crawled URLs and their summaries
    });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to store material" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Material processed and stored successfully",
      crawled_count: crawledUrls.length,
    });
  } catch (error) {
    console.error("Error processing URL:", error);
    return NextResponse.json(
      { error: "Failed to process URL" },
      { status: 500 },
    );
  }
}
