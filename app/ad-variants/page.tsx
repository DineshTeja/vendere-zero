"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  CircleX,
  Loader2,
  Image as ImageIcon,
  Tag,
  ExternalLink,
  List,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import Link from "next/link";
import { nanoid } from "nanoid";
import axios from "axios";
import { toast } from "sonner";
import TaskManager from "../components/TaskManager";

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

// Type definition for keyword variant
type KeywordVariant = {
  id: string;
  variant_id: string;
  keyword: string;
  image_url: string | null;
  search_volume: number;
  cpc: number;
  keyword_difficulty: number;
  competition_percentage: number;
  efficiency_index: number;
  confidence_score: number;
  source: string;
  explanation: string;
  geo_target: string | null;
  audience_segment: string | null;
  predicted_performance: number | null;
  created_at: string | null;
  user_id: string | null;
};

// Update Task type to match TaskManager's Task type
type Task = {
  id: string;
  user_id: string;
  type: string;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  meta: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
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
  const imageUrl = useMemo(() => getImageUrl(src), [src]);

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
          <ImageIcon className="h-5 w-5 opacity-40" />
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

export default function AdVariants() {
  const [adVariants, setAdVariants] = useState<AdVariantItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAdIndex, setSelectedAdIndex] = useState<number | null>(null);
  const [keywordVariants, setKeywordVariants] = useState<KeywordVariant[]>([]);
  const [loadingKeywordVariants, setLoadingKeywordVariants] = useState(false);
  const [keywordVariantsError, setKeywordVariantsError] = useState<
    string | null
  >(null);
  const [adVariantsWithKeywords, setAdVariantsWithKeywords] = useState<
    Record<string, number>
  >({});
  const [activeTab, setActiveTab] = useState("keywords");

  // Remove unused functions
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isTaskViewerOpen, setIsTaskViewerOpen] = useState(false);
  const [isGeneratingKeywordVariants, setIsGeneratingKeywordVariants] =
    useState(false);
  const [taskPollingInterval, setTaskPollingInterval] =
    useState<NodeJS.Timeout | null>(null);

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

      // Reset selected ad when we fetch new data
      setSelectedAdIndex(null);

      // Check which ads have keyword variants
      if (data && data.length > 0) {
        checkAdsWithKeywordVariants(data as AdVariantItem[]);
      }
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

  // Handle selecting an ad
  const handleSelectAd = (index: number) => {
    setSelectedAdIndex(index);

    // Fetch keyword variants for the selected ad
    const selectedItem = adVariants[index];
    if (selectedItem && selectedItem.mr_image_url) {
      fetchKeywordVariants(selectedItem.mr_image_url);
    } else {
      setKeywordVariants([]);
    }
  };

  // Fetch keyword variants for a specific ad
  const fetchKeywordVariants = async (imageUrl: string) => {
    setLoadingKeywordVariants(true);
    setKeywordVariantsError(null);

    try {
      const { data, error } = await supabase
        .from("keyword_variants")
        .select("*")
        .eq("image_url", imageUrl);

      if (error) throw error;

      setKeywordVariants(data || []);
    } catch (err) {
      console.error("Error fetching keyword variants:", err);
      setKeywordVariantsError(
        "Failed to load keyword variants. Please try again."
      );
    } finally {
      setLoadingKeywordVariants(false);
    }
  };

  // Check which ads have keyword variants
  const checkAdsWithKeywordVariants = async (ads: AdVariantItem[]) => {
    try {
      // Get counts of keyword variants for each image URL
      const { data, error } = await supabase
        .from("keyword_variants")
        .select("image_url")
        .not("image_url", "is", null);

      if (error) throw error;

      // Count variants per image URL
      const variantMap: Record<string, number> = {};
      data?.forEach((item) => {
        if (item.image_url) {
          variantMap[item.image_url] = (variantMap[item.image_url] || 0) + 1;
        }
      });

      setAdVariantsWithKeywords(variantMap);
    } catch (err) {
      console.error("Error checking ads with keyword variants:", err);
    }
  };

  // Add task to the tasks list
  const addTask = (task: Omit<Task, "id" | "created_at">) => {
    const newTask: Task = {
      id: nanoid(),
      created_at: new Date().toISOString(),
      ...task,
    };
    setTasks((prevTasks) => [newTask, ...prevTasks]);
    return newTask.id;
  };

  // Update task status
  const updateTask = (taskId: string, updates: Partial<Task>) => {
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === taskId ? { ...task, ...updates } : task
      )
    );
  };

  // Remove task from the list
  const removeTask = (taskId: string) => {
    setTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
  };

  // Poll for task status
  const startTaskPolling = () => {
    if (taskPollingInterval) {
      clearInterval(taskPollingInterval);
    }

    // Poll every 5 seconds for updates
    const interval = setInterval(async () => {
      const pendingOrProcessingTasks = tasks.filter(
        (task) => task.status === "pending" || task.status === "processing"
      );

      if (pendingOrProcessingTasks.length === 0) {
        if (taskPollingInterval) {
          clearInterval(taskPollingInterval);
          setTaskPollingInterval(null);
        }
        return;
      }

      // For each task, check for completion
      for (const task of pendingOrProcessingTasks) {
        try {
          // Check task status from API if we have a taskId
          if (task.meta.taskId) {
            const response = await fetch(
              `/api/keywords/batch-generate?taskId=${task.meta.taskId}`
            );
            if (response.ok) {
              const data = await response.json();

              // Update our local task with server status
              if (data.status === "completed") {
                updateTask(task.id, {
                  status: "completed",
                  completed_at: new Date().toISOString(),
                  meta: {
                    ...task.meta,
                    variantsGenerated:
                      data.result?.variants_generated ||
                      data.result?.total_processed ||
                      0,
                  },
                });

                // Refresh variants
                if (task.meta.imageUrl) {
                  await fetchKeywordVariants(task.meta.imageUrl);

                  // Also refresh the count in the list
                  if (selectedAd) {
                    checkAdsWithKeywordVariants([selectedAd]);
                  }

                  // Show success notification
                  toast.success(`Generated variants for ${task.meta.adName}`);
                }
              } else if (data.status === "failed") {
                updateTask(task.id, {
                  status: "failed",
                  completed_at: new Date().toISOString(),
                  error: data.error || "Task failed",
                });

                // Show error notification
                toast.error(
                  `Failed to generate variants: ${
                    data.error || "Unknown error"
                  }`
                );
              }
            }
          } else if (
            task.type === "keyword_generation" &&
            task.meta.imageUrl &&
            task.status === "processing"
          ) {
            // For tasks without taskId, check by refreshing variants
            await fetchKeywordVariants(task.meta.imageUrl);
          }
        } catch (err) {
          console.error("Error polling task status:", err);
        }
      }
    }, 5000);

    setTaskPollingInterval(interval);
  };

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (taskPollingInterval) {
        clearInterval(taskPollingInterval);
      }
    };
  }, [taskPollingInterval]);

  // Generate keyword variants using batch generation API
  const generateKeywordVariants = async () => {
    if (!selectedAd || isGeneratingKeywordVariants) return;

    setIsGeneratingKeywordVariants(true);
    const imageUrl = selectedAd.mr_image_url;

    try {
      // Get user ID from Supabase
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Create a new task in Supabase
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          user_id: user.id,
          type: "keyword_generation",
          status: "pending",
          meta: selectedAd,
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Format target audience correctly as a dictionary
      const targetAudience = {
        name: "General Audience",
        pain_points: ["No specific pain points identified"],
        preferences: ["General preferences"],
        characteristics: ["General characteristics"],
      };

      // If we have mr_target_audience data and it's in the correct format, use it
      if (
        selectedAd.mr_target_audience &&
        typeof selectedAd.mr_target_audience === "object"
      ) {
        // Extract data from the structure, handling potential different formats
        if ("name" in selectedAd.mr_target_audience) {
          targetAudience.name = selectedAd.mr_target_audience.name as string;
        }

        // For arrays, ensure they are actually arrays
        if ("pain_points" in selectedAd.mr_target_audience) {
          const painPoints = selectedAd.mr_target_audience.pain_points;
          targetAudience.pain_points = Array.isArray(painPoints)
            ? (painPoints.filter(Boolean) as string[])
            : typeof painPoints === "object" && painPoints !== null
            ? (Object.values(painPoints as Record<string, unknown>).filter(
                Boolean
              ) as string[])
            : ["No specific pain points identified"];
        }

        if ("preferences" in selectedAd.mr_target_audience) {
          const preferences = selectedAd.mr_target_audience.preferences;
          targetAudience.preferences = Array.isArray(preferences)
            ? (preferences.filter(Boolean) as string[])
            : typeof preferences === "object" && preferences !== null
            ? (Object.values(preferences as Record<string, unknown>).filter(
                Boolean
              ) as string[])
            : ["General preferences"];
        }

        if ("characteristics" in selectedAd.mr_target_audience) {
          const characteristics = selectedAd.mr_target_audience.characteristics;
          targetAudience.characteristics = Array.isArray(characteristics)
            ? (characteristics.filter(Boolean) as string[])
            : typeof characteristics === "object" && characteristics !== null
            ? (Object.values(characteristics as Record<string, unknown>).filter(
                Boolean
              ) as string[])
            : ["General characteristics"];
        }
      }

      // Format pain points correctly
      const painPoints = ["No specific pain points identified"];
      if (
        selectedAd.mr_pain_points &&
        typeof selectedAd.mr_pain_points === "object"
      ) {
        if (Array.isArray(selectedAd.mr_pain_points)) {
          painPoints.splice(
            0,
            painPoints.length,
            ...(selectedAd.mr_pain_points.filter(Boolean) as string[])
          );
        } else if (selectedAd.mr_pain_points !== null) {
          painPoints.splice(
            0,
            painPoints.length,
            ...(Object.values(
              selectedAd.mr_pain_points as Record<string, unknown>
            ).filter(Boolean) as string[])
          );
        }
      }

      // Update task status to processing
      await supabase
        .from("tasks")
        .update({ status: "processing" })
        .eq("id", task.id);

      // Call the batch generation API with all required fields
      const response = await axios.post("/api/keywords/batch-generate", {
        ad_features: {
          product_category: selectedAd.li_features?.[0] || "product",
          image_url: imageUrl,
          visual_cues: ["Advertisement image"],
          pain_points: painPoints,
          visitor_intent: selectedAd.mr_buying_stage || "Awareness",
          target_audience: targetAudience,
        },
        keywords: [selectedAd.li_name],
        user_id: user.id,
        image_url: imageUrl,
        task_id: task.id,
      });

      // If task viewer is not open, show a toast notification
      if (!isTaskViewerOpen) {
        toast.success("Keyword generation in progress");
      }

      // Fetch the updated variants
      await fetchKeywordVariants(imageUrl);

      // Update the ad variants with keywords count
      checkAdsWithKeywordVariants([selectedAd]);
    } catch (err: unknown) {
      console.error("Error generating keyword variants:", err);

      // Show error toast
      toast.error("Failed to generate keyword variants");
    } finally {
      setIsGeneratingKeywordVariants(false);
    }
  };

  // Add a function to fetch tasks
  const fetchTasks = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (tasks) {
      setTasks(tasks);
    }
  };

  // Add useEffect to fetch tasks on mount
  useEffect(() => {
    fetchTasks();
  }, []);

  return (
    <div
      className="w-full flex overflow-hidden box-border"
      style={{
        height: "calc(100vh - 60px)", // Find middle ground between 56px and 70px
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
              className="h-8 w-8 relative"
              onClick={() => setIsTaskViewerOpen(!isTaskViewerOpen)}
              title="Task Manager"
            >
              <List className="h-4 w-4" />
              {tasks.filter(
                (t) => t.status === "processing" || t.status === "pending"
              ).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
                  {
                    tasks.filter(
                      (t) => t.status === "processing" || t.status === "pending"
                    ).length
                  }
                </span>
              )}
            </Button>
          </div>
        </div>

        <Separator className="shrink-0" />

        {/* Scrollable Content - Fixed height that accounts for header + separator */}
        <div
          className="overflow-hidden box-border"
          style={{
            height: "calc(100% - 73px)", // Header height
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
                  <div className="font-medium mb-1">Error loading ads</div>
                  <p className="text-destructive/80 text-xs mb-3">{error}</p>
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
                  There are no ads available in your library at the moment.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Create separate arrays for ads with and without keywords */}
                {(() => {
                  // Split ads into two groups
                  const adsWithKeywords = adVariants.filter(
                    (ad) => (adVariantsWithKeywords[ad.mr_image_url] || 0) > 0
                  );
                  const adsWithoutKeywords = adVariants.filter(
                    (ad) => (adVariantsWithKeywords[ad.mr_image_url] || 0) === 0
                  );

                  // Sort adsWithKeywords by count in descending order
                  adsWithKeywords.sort((a, b) => {
                    const aCount = adVariantsWithKeywords[a.mr_image_url] || 0;
                    const bCount = adVariantsWithKeywords[b.mr_image_url] || 0;
                    return bCount - aCount;
                  });

                  return (
                    <>
                      {/* Section for ads with keyword variants */}
                      {adsWithKeywords.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-medium px-2 text-foreground/80 flex items-center">
                            <Badge
                              variant="outline"
                              className="mr-2 px-1.5 py-0 h-4"
                            >
                              {adsWithKeywords.length}
                            </Badge>
                            Ads with Keyword Variants
                          </h3>
                          <div className="grid grid-cols-3 gap-2 p-2 pb-4 border-b">
                            {adsWithKeywords.map((item, index) => {
                              const originalIndex = adVariants.findIndex(
                                (ad) => ad.mr_id === item.mr_id
                              );
                              return (
                                <div key={`with-${item.mr_id}-${index}`}>
                                  <div
                                    className={`p-1 rounded-md transition-colors ${
                                      selectedAdIndex === originalIndex
                                        ? "bg-primary/10"
                                        : "hover:bg-muted"
                                    }`}
                                  >
                                    <div className="relative">
                                      <AdImage
                                        src={item.mr_image_url}
                                        alt={item.li_name || "Ad variant"}
                                        className="w-full"
                                        isSelected={
                                          selectedAdIndex === originalIndex
                                        }
                                        onClick={() =>
                                          handleSelectAd(originalIndex)
                                        }
                                      />
                                      <div className="absolute top-1 right-1 bg-background text-primary rounded-md px-1.5 py-0.5 flex items-center shadow-sm text-[10px] font-medium border border-border/30">
                                        <Tag className="h-3 w-3 mr-1" />
                                        {
                                          adVariantsWithKeywords[
                                            item.mr_image_url
                                          ]
                                        }
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Section for ads without keyword variants */}
                      {adsWithoutKeywords.length > 0 && (
                        <div className="space-y-3 mt-4">
                          <h3 className="text-sm font-medium px-2 text-foreground/80 flex items-center">
                            <Badge
                              variant="outline"
                              className="mr-2 px-1.5 py-0 h-4"
                            >
                              {adsWithoutKeywords.length}
                            </Badge>
                            Ads without Keyword Data
                          </h3>
                          <div className="grid grid-cols-3 gap-2 p-2">
                            {adsWithoutKeywords.map((item, index) => {
                              const originalIndex = adVariants.findIndex(
                                (ad) => ad.mr_id === item.mr_id
                              );
                              return (
                                <div key={`without-${item.mr_id}-${index}`}>
                                  <div
                                    className={`p-1 rounded-md transition-colors ${
                                      selectedAdIndex === originalIndex
                                        ? "bg-primary/10"
                                        : "hover:bg-muted"
                                    }`}
                                  >
                                    <div className="relative">
                                      <AdImage
                                        src={item.mr_image_url}
                                        alt={item.li_name || "Ad variant"}
                                        className="w-full"
                                        isSelected={
                                          selectedAdIndex === originalIndex
                                        }
                                        onClick={() =>
                                          handleSelectAd(originalIndex)
                                        }
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Right Panel - Detail View */}
      <div className="flex-1 h-full flex flex-col overflow-hidden box-border">
        <div
          className="px-6 py-4 bg-card shrink-0 box-border"
          style={{ height: "73px" }} // Match the left panel header height
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
              <Link
                href={`/library/${
                  selectedAd.li_id
                }?image_url=${encodeURIComponent(selectedAd.mr_image_url)}`}
                className="ml-4"
              >
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>View Details</span>
                </Button>
              </Link>
            </div>
          ) : (
            <CardTitle className="text-xl">Ad Variants</CardTitle>
          )}
        </div>

        <Separator className="shrink-0" />

        <div
          className="overflow-hidden box-border"
          style={{
            height: "calc(100% - 74px)", // Account for header + separator
            padding: "24px",
          }}
        >
          <ScrollArea className="h-full">
            {selectedAd ? (
              <Tabs
                defaultValue="keywords"
                className="w-full"
                onValueChange={(value) => setActiveTab(value)}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold">Ad Variants</h2>

                  <TabsList className="bg-transparent space-x-2 relative">
                    {/* Active tab indicator - animated background */}
                    <motion.div
                      className="absolute bg-muted/50 border-[0.5px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] rounded-none"
                      layoutId="tab-background"
                      initial={false}
                      transition={{
                        type: "spring",
                        bounce: 0.2,
                        duration: 0.6,
                      }}
                      style={{
                        width: "var(--tab-width)",
                        height: "var(--tab-height)",
                        left: "var(--tab-left)",
                        top: "var(--tab-top)",
                      }}
                    />

                    <TabsTrigger
                      value="keywords"
                      className="relative rounded-sm px-2 py-1 text-sm font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                      ref={(el) => {
                        if (el && activeTab === "keywords") {
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
                      <motion.span
                        initial={{ opacity: 0.8 }}
                        animate={{
                          opacity: activeTab === "keywords" ? 1 : 0.8,
                        }}
                        transition={{ duration: 0.2 }}
                      >
                        Keyword Variants
                      </motion.span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="headlines"
                      className="relative rounded-sm px-2 py-1 text-sm font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                      ref={(el) => {
                        if (el && activeTab === "headlines") {
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
                      <motion.span
                        initial={{ opacity: 0.8 }}
                        animate={{
                          opacity: activeTab === "headlines" ? 1 : 0.8,
                        }}
                        transition={{ duration: 0.2 }}
                      >
                        Ad Headlines
                      </motion.span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Keyword Variants Tab */}
                <TabsContent value="keywords" className="mt-0">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="space-y-4">
                      <div className="flex justify-end items-center">
                        <Button
                          size="sm"
                          onClick={generateKeywordVariants}
                          disabled={isGeneratingKeywordVariants}
                        >
                          {isGeneratingKeywordVariants ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            "Generate Keyword Variants"
                          )}
                        </Button>
                      </div>

                      {loadingKeywordVariants ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
                        </div>
                      ) : keywordVariantsError ? (
                        <div className="bg-destructive/10 p-4 rounded-md text-destructive text-sm">
                          <p>{keywordVariantsError}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              selectedAd.mr_image_url &&
                              fetchKeywordVariants(selectedAd.mr_image_url)
                            }
                            className="mt-2"
                          >
                            Retry
                          </Button>
                        </div>
                      ) : keywordVariants.length > 0 ? (
                        <div className="border rounded-md">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground">
                                  Keyword
                                </th>
                                <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
                                  Search Vol
                                </th>
                                <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
                                  CPC
                                </th>
                                <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
                                  Difficulty
                                </th>
                                <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
                                  Conf
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {keywordVariants.map((variant, idx) => (
                                <tr
                                  key={variant.id}
                                  className={`border-b ${
                                    idx % 2 === 0
                                      ? "bg-background"
                                      : "bg-muted/30"
                                  }`}
                                >
                                  <td className="py-2 px-4 text-sm">
                                    {variant.keyword}
                                  </td>
                                  <td className="py-2 px-2 text-center text-xs">
                                    {variant.search_volume.toLocaleString()}
                                  </td>
                                  <td className="py-2 px-2 text-center text-xs">
                                    ${variant.cpc.toFixed(2)}
                                  </td>
                                  <td className="py-2 px-2 text-center text-xs">
                                    <div className="flex items-center justify-center">
                                      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${
                                            variant.keyword_difficulty < 30
                                              ? "bg-green-500"
                                              : variant.keyword_difficulty < 60
                                              ? "bg-yellow-500"
                                              : "bg-red-500"
                                          }`}
                                          style={{
                                            width: `${variant.keyword_difficulty}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="ml-1">
                                        {variant.keyword_difficulty}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-center text-xs">
                                    <Badge
                                      variant={
                                        variant.confidence_score > 0.7
                                          ? "default"
                                          : "outline"
                                      }
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      {(variant.confidence_score * 100).toFixed(
                                        0
                                      )}
                                      %
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="bg-muted/30 border rounded-lg p-6 flex flex-col items-center justify-center text-center">
                          <p className="text-muted-foreground text-sm mb-4">
                            No keyword variants found for this ad. Generate
                            variants to get optimization suggestions.
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </TabsContent>

                {/* Ad Headline Variants Tab */}
                <TabsContent value="headlines" className="mt-0">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="space-y-4">
                      <div className="flex justify-end items-center">
                        <Button size="sm" disabled={true}>
                          Generate Headline Variants
                        </Button>
                      </div>

                      <div className="bg-muted/30 border rounded-lg p-8 flex flex-col items-center justify-center text-center">
                        <div className="bg-background p-3 rounded-full mb-3">
                          <Loader2 className="h-8 w-8 text-muted-foreground/60" />
                        </div>
                        <h3 className="text-lg font-medium mb-1">
                          Coming Soon
                        </h3>
                        <p className="text-muted-foreground max-w-md text-sm mb-4">
                          Ad headline variant generation will be available in a
                          future update.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 p-6 bg-muted/20 rounded-full">
                  <ImageIcon className="h-12 w-12 text-muted-foreground/60" />
                </div>
                <h3 className="text-xl font-medium mb-2">No Ad Selected</h3>
                <p className="text-muted-foreground max-w-md">
                  Select an ad from the library on the left to view its details
                  and variants.
                </p>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Replace TaskViewer with TaskManager */}
      <TaskManager
        tasks={tasks}
        onRemoveTask={async (taskId) => {
          await supabase.from("tasks").delete().eq("id", taskId);
          await fetchTasks();
        }}
        isOpen={isTaskViewerOpen}
        onClose={() => setIsTaskViewerOpen(false)}
        onTasksUpdate={setTasks}
      />
    </div>
  );
}
