import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Get metadata
    const title = $("title").text() ||
      $('meta[property="og:title"]').attr("content") || "";
    const description = $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") || "";
    const domain = new URL(url).hostname;

    return NextResponse.json({
      title: title.trim(),
      description: description.trim(),
      domain,
    });
  } catch (error) {
    console.error("Error fetching URL metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch URL metadata" },
      { status: 500 },
    );
  }
}
