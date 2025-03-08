"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { CircleX, Loader2, Settings, Scroll } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";

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

// Component to handle ad image display with ad blocker consideration
const AdImage = ({
  src,
  className = "",
  size,
  alt = "Ad image",
  isSelected = false,
  onClick,
}: {
  src?: string;
  className?: string;
  size?: number;
  alt?: string;
  isSelected?: boolean;
  onClick?: () => void;
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [wasBlocked, setWasBlocked] = useState(false);

  // Check if a URL is likely to be blocked by ad blockers
  const isLikelyToBeBlocked = (url: string): boolean => {
    return (
      url.includes("googlesyndication") ||
      url.includes("googleads") ||
      url.includes("doubleclick") ||
      url.includes("ad.") ||
      url.includes(".ad") ||
      url.includes("ads.") ||
      url.includes(".ads")
    );
  };

  // Process image URL - use proxy for potentially blocked URLs
  const getImageUrl = (originalUrl?: string): string | undefined => {
    if (!originalUrl) return undefined;

    // If it's a data URL, return as is
    if (originalUrl.startsWith("data:")) return originalUrl;

    // If URL is likely to be blocked, use our proxy
    if (isLikelyToBeBlocked(originalUrl)) {
      return `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
    }

    // Otherwise return the original URL
    return originalUrl;
  };

  // Computed image URL with proxy if needed
  const imageUrl = React.useMemo(() => getImageUrl(src), [src]);

  // Reset error state if src changes
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
    setWasBlocked(false);
  }, [src]);

  // Function to detect errors
  const handleImageError = () => {
    setHasError(true);
    setIsLoading(false);

    // If the URL seems like it would be blocked, mark it
    if (src && isLikelyToBeBlocked(src)) {
      setWasBlocked(true);
    }
  };

  // If no source or error, show fallback
  if (!imageUrl || hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/40 text-muted-foreground text-xs text-center p-1 rounded-md border ${className} ${
          isSelected ? "ring-2 ring-primary" : ""
        }`}
        style={
          size
            ? { width: size, height: size }
            : { aspectRatio: "1/1", width: "100%" }
        }
        onClick={onClick}
      >
        {wasBlocked ? (
          <div className="flex flex-col items-center">
            <span>Ad</span>
            <span className="text-[9px] mt-1">(Blocked)</span>
          </div>
        ) : (
          <Settings className="h-5 w-5 opacity-40" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative border rounded-md overflow-hidden bg-background cursor-pointer transition-all hover:opacity-90 ${
        isSelected ? "ring-2 ring-primary" : ""
      } ${className}`}
      style={
        size
          ? { width: size, height: size }
          : { aspectRatio: "1/1", width: "100%" }
      }
      onClick={onClick}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-10">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <Image
        src={imageUrl}
        alt={alt}
        fill
        className="object-cover"
        onError={handleImageError}
        onLoadingComplete={() => setIsLoading(false)}
        unoptimized
      />
    </div>
  );
};

export default function Automations() {
  const [adVariants, setAdVariants] = useState<AdVariantItem[]>([]);
  const [selectedAdIndex, setSelectedAdIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("automations");

  // Get the selected ad
  const selectedAd =
    selectedAdIndex !== null ? adVariants[selectedAdIndex] : null;

  // Fetch ad variants from Supabase
  const fetchAdVariants = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Call the RPC function to get joined data without pagination
      const { data, error } = await supabase
        .rpc("join_market_research_and_library_items")
        .order("mr_created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setAdVariants(data as AdVariantItem[]);
      setSelectedAdIndex(null);
    } catch (err) {
      console.error("Error fetching ad variants:", err);
      setError("Failed to load ad variants. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data when component mounts
  useEffect(() => {
    fetchAdVariants();
  }, []);

  return (
    <div className="bg-background overflow-hidden overflow-y-clip overscroll-y-none">
      <div className="max-w-[1600px] mx-auto ">
        {/* Main Content with Tabs */}
        <Tabs
          defaultValue="automations"
          className="w-full"
          onValueChange={(value) => setActiveTab(value)}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">
                {activeTab === "automations"
                  ? "Automation Builder"
                  : "Company Rules"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {activeTab === "automations"
                  ? "Create and manage automated workflows for your ad campaigns"
                  : "Define guidelines and constraints for your automation workflows"}
              </p>
            </div>

            <TabsList className="bg-transparent space-x-2 relative">
              {/* Active tab indicator - animated background */}
              {activeTab && (
                <motion.div
                  className="absolute bg-muted/50 border-[0.5px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] rounded-none"
                  layoutId="tab-background"
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  style={{
                    width: "var(--tab-width)",
                    height: "var(--tab-height)",
                    left: "var(--tab-left)",
                    top: "var(--tab-top)",
                  }}
                />
              )}

              <TabsTrigger
                value="automations"
                className="relative rounded-sm px-2 py-1 text-sm font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                ref={(el) => {
                  if (el && activeTab === "automations") {
                    const rect = el.getBoundingClientRect();
                    document.documentElement.style.setProperty(
                      "--tab-width",
                      `${rect.width}px`
                    );
                    document.documentElement.style.setProperty(
                      "--tab-height",
                      `${rect.height}px`
                    );
                    document.documentElement.style.setProperty(
                      "--tab-left",
                      `${el.offsetLeft}px`
                    );
                    document.documentElement.style.setProperty(
                      "--tab-top",
                      `${el.offsetTop}px`
                    );
                  }
                }}
              >
                <Settings className="h-4 w-4" />
                <motion.span
                  initial={{ opacity: 0.8 }}
                  animate={{ opacity: activeTab === "automations" ? 1 : 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  Automations
                </motion.span>
              </TabsTrigger>

              <TabsTrigger
                value="rules"
                className="relative rounded-sm px-2 py-1 text-sm font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                ref={(el) => {
                  if (el && activeTab === "rules") {
                    const rect = el.getBoundingClientRect();
                    document.documentElement.style.setProperty(
                      "--tab-width",
                      `${rect.width}px`
                    );
                    document.documentElement.style.setProperty(
                      "--tab-height",
                      `${rect.height}px`
                    );
                    document.documentElement.style.setProperty(
                      "--tab-left",
                      `${el.offsetLeft}px`
                    );
                    document.documentElement.style.setProperty(
                      "--tab-top",
                      `${el.offsetTop}px`
                    );
                  }
                }}
              >
                <Scroll className="h-4 w-4" />
                <motion.span
                  initial={{ opacity: 0.8 }}
                  animate={{ opacity: activeTab === "rules" ? 1 : 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  Rules
                </motion.span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Automations Tab Content */}
          <TabsContent value="automations" className="mt-0 border">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className="w-full flex overflow-hidden box-border"
                style={{
                  height: "calc(100vh - 140px)",
                  margin: 0,
                  padding: 0,
                }}
              >
                {/* Left Panel - Ad Library */}
                <div className="w-72 h-full border-r flex flex-col overflow-hidden box-border">
                  {/* Header */}
                  <div
                    className="px-6 py-4 bg-card shrink-0 box-border"
                    style={{ height: "73px" }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl">Ad Library</CardTitle>
                        <CardDescription>
                          {adVariants.length > 0
                            ? `${adVariants.length} ads available`
                            : "Browse available ads"}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        title="Create Automation"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Separator className="shrink-0" />

                  {/* Scrollable Content */}
                  <div
                    className="overflow-hidden box-border"
                    style={{
                      height: "calc(100% - 73px)",
                      padding: "8px",
                    }}
                  >
                    <ScrollArea className="h-full">
                      {isLoading ? (
                        <div className="flex justify-center items-center py-20">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
                            <span className="text-sm text-muted-foreground">
                              Loading ads...
                            </span>
                          </div>
                        </div>
                      ) : error ? (
                        <div className="px-2 py-6">
                          <div className="bg-destructive/10 p-4 rounded-md text-destructive text-sm">
                            <div className="font-medium mb-1">
                              Error loading ads
                            </div>
                            <p className="text-destructive/80 text-xs mb-3">
                              {error}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={fetchAdVariants}
                              className="w-full"
                            >
                              Retry
                            </Button>
                          </div>
                        </div>
                      ) : adVariants.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                          <CircleX className="h-10 w-10 text-muted-foreground/60 mb-3" />
                          <h3 className="text-lg font-medium mb-1">
                            No ad variants found
                          </h3>
                          <p className="text-muted-foreground text-sm max-w-xs">
                            There are no ads available in your library at the
                            moment.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 p-2">
                          {adVariants.map((item, index) => (
                            <div key={item.mr_id}>
                              <div
                                className={`p-1 rounded-md transition-colors ${
                                  selectedAdIndex === index
                                    ? "bg-primary/10"
                                    : "hover:bg-muted"
                                }`}
                              >
                                <AdImage
                                  src={item.mr_image_url}
                                  alt={item.li_name || "Ad variant"}
                                  className="w-full"
                                  isSelected={selectedAdIndex === index}
                                  onClick={() => setSelectedAdIndex(index)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>

                {/* Right Panel - Detail View */}
                <div className="flex-1 h-full flex flex-col overflow-hidden box-border">
                  <div
                    className="px-6 py-4 bg-card shrink-0 box-border"
                    style={{ height: "73px" }}
                  >
                    {selectedAd ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Small preview image */}
                          <AdImage
                            src={selectedAd.mr_image_url}
                            alt={selectedAd.li_name || "Ad preview"}
                            size={48}
                            className="shrink-0"
                          />
                          <div className="overflow-hidden">
                            <CardTitle className="text-xl truncate">
                              {selectedAd.li_name}
                            </CardTitle>
                            {selectedAd.li_description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-tight mt-0.5">
                                {selectedAd.li_description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <CardTitle className="text-xl">Automations</CardTitle>
                    )}
                  </div>

                  <Separator className="shrink-0" />

                  <div
                    className="overflow-hidden box-border"
                    style={{
                      height: "calc(100% - 74px)",
                      padding: "24px",
                    }}
                  >
                    <ScrollArea className="h-full">
                      {selectedAd ? (
                        <div>
                          {/* Automation details will go here */}
                          <div className="text-sm text-muted-foreground">
                            Automation details coming soon...
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="mb-4 p-6 bg-muted/20 rounded-full">
                            <Settings className="h-12 w-12 text-muted-foreground/60" />
                          </div>
                          <h3 className="text-xl font-medium mb-2">
                            No Automation Selected
                          </h3>
                          <p className="text-muted-foreground max-w-md">
                            Select an automation from the list on the left to
                            view its details and configuration.
                          </p>
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* Rules Tab Content */}
          <TabsContent value="rules" className="mt-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="space-y-4">
                <div className="border bg-muted/50 p-6 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Set up rules and guidelines that will be automatically
                    enforced across all your automations. This helps maintain
                    consistency and compliance in your automated workflows.
                  </p>
                </div>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
