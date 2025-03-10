"use client";

import React, { useState, useEffect, useRef } from "react";
import { CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  CircleX,
  Loader2,
  Settings,
  Scroll,
  Plus,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

// Update the type for original headlines
type OriginalHeadline = {
  text: string;
  type: string;
  visual_context: string;
};

// Update the RPC function result type
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
  mr_original_headlines: OriginalHeadline[];
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

// Type for custom rules
type CustomRule = {
  id: string;
  user_id: string;
  type: string;
  name: string;
  description: string;
  value:
    | string
    | number
    | boolean
    | string[]
    | Record<string, string | number | boolean>;
  created_at: string;
  updated_at: string;
};

// Type for brand material rules
type BrandMaterial = {
  id: string;
  material_url: string;
  material_type: string;
  content_rules: {
    type: string;
    name: string;
    description: string;
    value:
      | string
      | number
      | boolean
      | string[]
      | Record<string, string | number | boolean>;
  }[];
};

// Rule type options
const RULE_TYPES = [
  "tone",
  "formatting",
  "keyword",
  "compliance",
  "style",
  "voice",
] as const;

type RuleType = (typeof RULE_TYPES)[number];

// Utility function to format URLs in a condensed way
const formatUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");
    const path = urlObj.pathname === "/" ? "" : urlObj.pathname;
    return `${domain}${path}`.slice(0, 30) + (url.length > 30 ? "..." : "");
  } catch {
    return url.slice(0, 30) + (url.length > 30 ? "..." : "");
  }
};

type Headline = {
  area?: number;
  text: string;
  type: string;
  original: string;
  aspect_ratio?: number;
  bounding_box?: {
    width: number;
    center: [number, number];
    height: number;
    top_left: [number, number];
    top_right: [number, number];
    bottom_left: [number, number];
    bottom_right: [number, number];
  };
};

// Component to handle ad image display with ad blocker consideration
const AdImage = ({
  src,
  className = "",
  size,
  alt = "Ad image",
  isSelected = false,
  onClick,
  preserveAspectRatio = false,
  new_headlines = [],
  handleBoundingBoxClick = () => {},
}: {
  src?: string;
  className?: string;
  size?: number;
  alt?: string;
  isSelected?: boolean;
  onClick?: () => void;
  preserveAspectRatio?: boolean;
  new_headlines?: Array<Headline>;
  handleBoundingBoxClick?: (headline: Headline) => void;
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [wasBlocked, setWasBlocked] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

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

  // Reset dimensions when src changes or when component remounts
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
    setWasBlocked(false);
    setOriginalDimensions(null);
    setImageDimensions(null);

    // Get original image dimensions
    if (imageUrl) {
      const img = new window.Image();
      img.onload = () => {
        setOriginalDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.src = imageUrl;
    }

    // Cleanup function
    return () => {
      setImageDimensions(null);
      setOriginalDimensions(null);
    };
  }, [imageUrl]);

  // Update container and rendered image dimensions when image loads or container resizes
  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current || !imageRef.current) return;

      const imageRect = imageRef.current.getBoundingClientRect();

      // Only update if dimensions have actually changed
      if (
        !imageDimensions ||
        imageDimensions.width !== imageRect.width ||
        imageDimensions.height !== imageRect.height
      ) {
        setImageDimensions({
          width: imageRect.width,
          height: imageRect.height,
        });
      }
    };

    const observer = new ResizeObserver(updateDimensions);

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Initial update
    updateDimensions();

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [imageDimensions]);

  // Add mutation observer to detect DOM changes that might affect layout
  useEffect(() => {
    const mutationObserver = new MutationObserver(() => {
      if (containerRef.current && imageRef.current) {
        const imageRect = imageRef.current.getBoundingClientRect();

        setImageDimensions({
          width: imageRect.width,
          height: imageRect.height,
        });
      }
    });

    if (containerRef.current) {
      mutationObserver.observe(containerRef.current, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    return () => {
      mutationObserver.disconnect();
    };
  }, []);

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
            : preserveAspectRatio
            ? { aspectRatio: "1/1", width: "100%" }
            : { width: "100%", minHeight: "400px" }
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
      ref={containerRef}
      className={`relative border rounded-md overflow-hidden bg-background cursor-pointer transition-all hover:opacity-90 ${
        isSelected ? "ring-2 ring-primary" : ""
      } ${className}`}
      style={
        size
          ? { width: size, height: size }
          : preserveAspectRatio
          ? { aspectRatio: "1/1", width: "100%" }
          : { width: "100%", height: "100%" }
      }
      onClick={onClick}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-10">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center justify-center h-full w-full relative">
        <img
          ref={imageRef}
          src={imageUrl}
          alt={alt}
          className={cn(
            "w-full h-full",
            isSelected ? "ring-2 ring-primary" : "",
            preserveAspectRatio ? "object-cover" : "object-contain"
          )}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
          }}
          onError={handleImageError}
          onLoad={(e) => {
            setIsLoading(false);
            // Update original dimensions when image loads
            const img = e.target as HTMLImageElement;
            setOriginalDimensions({
              width: img.naturalWidth,
              height: img.naturalHeight,
            });
          }}
        />
      </div>

      {/* Bounding Box Overlays */}
      {!isLoading &&
        imageDimensions &&
        originalDimensions &&
        new_headlines.map((headline, index) => {
          if (!headline.bounding_box) return null;

          const box = headline.bounding_box;
          const containerRect = containerRef.current?.getBoundingClientRect();
          const imageRect = imageRef.current?.getBoundingClientRect();

          if (!containerRect || !imageRect) return null;

          // Calculate the actual rendered image dimensions
          const renderedWidth = imageRect.width;
          const renderedHeight = imageRect.height;

          // Calculate scale factors based on the actual rendered image size
          const scaleX = renderedWidth / originalDimensions.width;
          const scaleY = renderedHeight / originalDimensions.height;

          // Calculate padding due to object-contain
          const horizontalPadding = (containerRect.width - renderedWidth) / 2;
          const verticalPadding = (containerRect.height - renderedHeight) / 2;

          // Scale and position the bounding box
          const scaledBox = {
            width: box.width * scaleX,
            height: box.height * scaleY,
            top: box.top_left[1] * scaleY + verticalPadding,
            left: box.top_left[0] * scaleX + horizontalPadding,
          };

          // Calculate available space on each side
          const spaceLeft = scaledBox.left;
          const spaceRight =
            containerRect.width - (scaledBox.left + scaledBox.width);
          const spaceTop = scaledBox.top;

          // Determine label position based on available space
          // Try left/right first, then fallback to top/bottom if necessary
          const labelWidth = 200; // max-w-[200px] from the className
          const labelHeight = 32; // Approximate height of the label
          const padding = 8; // Padding between box and label

          let labelPosition: "left" | "right" | "top" | "bottom";

          if (spaceLeft >= labelWidth + padding) {
            labelPosition = "left";
          } else if (spaceRight >= labelWidth + padding) {
            labelPosition = "right";
          } else if (spaceTop >= labelHeight + padding) {
            labelPosition = "top";
          } else {
            labelPosition = "bottom";
          }

          return (
            <div key={index} onClick={() => handleBoundingBoxClick(headline)}>
              {/* Bounding box */}
              <div
                className="absolute border-2 border-primary/50 bg-primary/10 hover:bg-green-500/20 hover:border-green-500/50 transition-all"
                style={{
                  width: scaledBox.width,
                  height: scaledBox.height,
                  top: scaledBox.top,
                  left: scaledBox.left,
                }}
              />

              {/* Variant text */}
              <div
                className={`absolute px-2 py-1 bg-background/90 text-xs border rounded shadow-sm max-w-[200px] whitespace-normal`}
                style={{
                  ...{
                    left:
                      labelPosition === "left"
                        ? scaledBox.left - labelWidth - padding
                        : labelPosition === "right"
                        ? scaledBox.left + scaledBox.width + padding
                        : scaledBox.left,
                    top:
                      labelPosition === "top"
                        ? scaledBox.top - labelHeight - padding
                        : labelPosition === "bottom"
                        ? scaledBox.top + scaledBox.height + padding
                        : scaledBox.top +
                          scaledBox.height / 2 -
                          labelHeight / 2,
                    width:
                      labelPosition === "left" || labelPosition === "right"
                        ? labelWidth
                        : undefined,
                    minHeight: labelHeight,
                    height: "auto",
                  },
                }}
              >
                {headline.text}
              </div>
            </div>
          );
        })}
    </div>
  );
};

// Update the headline variants type
type HeadlineVariant = {
  id: string;
  image_url: string;
  rules_used: Array<{
    type: string;
    name: string;
    description: string;
    value: string | number | boolean | string[] | Record<string, unknown>;
  }>;
  original_headlines: Array<{
    text: string;
    type: string;
    visual_context: string;
  }>;
  new_headlines: Array<{
    text: string;
    type: string;
    visual_context: string;
    original: string;
    improvements: string[];
    expected_impact: string[];
    target_audience: string[];
    pain_points_addressed: string[];
  }>;
  created_at: string;
  updated_at: string;
};

export default function Automations() {
  const [adVariants, setAdVariants] = useState<AdVariantItem[]>([]);
  const [selectedAdIndex, setSelectedAdIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("automations");

  // Rules state
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [brandMaterials, setBrandMaterials] = useState<BrandMaterial[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  // Add Rule Dialog State
  const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newRule, setNewRule] = useState<{
    type: RuleType | "";
    name: string;
    description: string;
    value: string;
  }>({
    type: "",
    name: "",
    description: "",
    value: "",
  });

  // Add Edit Rule Dialog State
  const [isEditRuleOpen, setIsEditRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const [editedRule, setEditedRule] = useState<{
    type: RuleType | "";
    name: string;
    description: string;
    value: string;
  }>({
    type: "",
    name: "",
    description: "",
    value: "",
  });

  // Add Delete Rule Dialog State
  const [ruleToDelete, setRuleToDelete] = useState<CustomRule | null>(null);

  // Add Rule Selection Dialog State
  const [isRuleSelectionOpen, setIsRuleSelectionOpen] = useState(false);
  const [selectedRules, setSelectedRules] = useState<{
    [key: string]: boolean;
  }>({});

  // Update the state definition
  const [headlineVariants, setHeadlineVariants] = useState<HeadlineVariant[]>(
    []
  );

  // Add state for variant count and generation progress
  const [variantCount, setVariantCount] = useState(3);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);

  // Add state for selected variant
  const [selectedVariant, setSelectedVariant] =
    useState<HeadlineVariant | null>(null);

  // Add state for current headline index
  const [currentHeadlineIndex, setCurrentHeadlineIndex] = useState(0);

  // Add state for variant to delete
  const [variantToDelete, setVariantToDelete] =
    useState<HeadlineVariant | null>(null);

  // Reset current headline index when selected variant changes
  useEffect(() => {
    setCurrentHeadlineIndex(0);
  }, [selectedVariant]);

  // Initialize selected rules when dialog opens
  useEffect(() => {
    if (isRuleSelectionOpen) {
      const initialSelection: { [key: string]: boolean } = {};

      // Select all custom rules by default
      customRules.forEach((rule) => {
        initialSelection[`custom-${rule.id}`] = true;
      });

      // Select all brand material rules by default
      brandMaterials.forEach((material) => {
        material.content_rules.forEach((rule, index) => {
          initialSelection[`material-${material.id}-${index}`] = true;
        });
      });

      setSelectedRules(initialSelection);
    }
  }, [isRuleSelectionOpen, customRules, brandMaterials]);

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

  // Fetch custom rules and brand material rules
  const fetchRules = async () => {
    setIsLoadingRules(true);
    setRulesError(null);

    try {
      // Fetch custom rules
      const { data: customRulesData, error: customRulesError } = await supabase
        .from("custom_rules")
        .select("*")
        .order("created_at", { ascending: false });

      if (customRulesError) throw customRulesError;

      // Fetch brand materials with content rules
      const { data: materialsData, error: materialsError } = await supabase
        .from("materials")
        .select("id, material_url, material_type, content_rules")
        .order("created_at", { ascending: false });

      if (materialsError) throw materialsError;

      setCustomRules(customRulesData);
      setBrandMaterials(materialsData);
    } catch (err) {
      console.error("Error fetching rules:", err);
      setRulesError("Failed to load rules. Please try again later.");
    } finally {
      setIsLoadingRules(false);
    }
  };

  // Fetch data when component mounts
  useEffect(() => {
    fetchAdVariants();
  }, []);

  // Fetch rules when tab changes to rules
  useEffect(() => {
    if (activeTab === "rules" || isRuleSelectionOpen) {
      fetchRules();
    }
  }, [activeTab, isRuleSelectionOpen]);

  // Set up real-time subscriptions for custom rules
  useEffect(() => {
    // Set up real-time subscription for custom rules
    const channel = supabase.channel("custom_rules_changes");

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "custom_rules",
        },
        (payload) => {
          console.log("Custom rule change received!", payload);
          if (payload.eventType === "INSERT") {
            setCustomRules((prev) => [payload.new as CustomRule, ...prev]);
          } else if (payload.eventType === "DELETE") {
            setCustomRules((prev) =>
              prev.filter((rule) => rule.id !== payload.old.id)
            );
          } else if (payload.eventType === "UPDATE") {
            setCustomRules((prev) =>
              prev.map((rule) =>
                rule.id === payload.new.id ? (payload.new as CustomRule) : rule
              )
            );
          }
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      channel.unsubscribe();
    };
  }, []);

  // Update the subscription handler
  useEffect(() => {
    const channel = supabase.channel("headline_variants_changes");

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "headline_variants",
        },
        (payload) => {
          console.log("Headline variant change received!", payload);
          if (payload.eventType === "INSERT") {
            setHeadlineVariants((prev) => [
              ...prev,
              payload.new as HeadlineVariant,
            ]);
          } else if (payload.eventType === "DELETE") {
            setHeadlineVariants((prev) =>
              prev.filter((variant) => variant.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    // Initial fetch of headline variants
    const fetchHeadlineVariants = async () => {
      const { data, error } = await supabase
        .from("headline_variants")
        .select("*");

      if (error) {
        console.error("Error fetching headline variants:", error);
        return;
      }

      setHeadlineVariants(data);
    };

    fetchHeadlineVariants();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  // Handle rule creation
  const handleCreateRule = async () => {
    if (
      !newRule.type ||
      !newRule.name ||
      !newRule.description ||
      !newRule.value
    ) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);

    try {
      // Try to parse the value as JSON if it looks like an array or object
      let parsedValue: CustomRule["value"] = newRule.value;
      if (newRule.value.startsWith("[") || newRule.value.startsWith("{")) {
        try {
          parsedValue = JSON.parse(newRule.value);
        } catch {
          // If parsing fails, use the original string value
          console.warn("Failed to parse value as JSON, using as string");
        }
      }

      const { error } = await supabase.from("custom_rules").insert({
        user_id: "97d82337-5d25-4258-b47f-5be8ea53114c",
        type: newRule.type,
        name: newRule.name,
        description: newRule.description,
        value: parsedValue,
      });

      if (error) throw error;

      toast.success("Rule created successfully");
      setIsAddRuleOpen(false);
      setNewRule({ type: "", name: "", description: "", value: "" });
    } catch (err) {
      console.error("Error creating rule:", err);
      toast.error("Failed to create rule. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle rule edit
  const handleEditRule = async () => {
    if (
      !editedRule.type ||
      !editedRule.name ||
      !editedRule.description ||
      !editedRule.value ||
      !editingRule
    ) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);

    try {
      // Try to parse the value as JSON if it looks like an array or object
      let parsedValue: CustomRule["value"] = editedRule.value;
      if (
        editedRule.value.startsWith("[") ||
        editedRule.value.startsWith("{")
      ) {
        try {
          parsedValue = JSON.parse(editedRule.value);
        } catch {
          // If parsing fails, use the original string value
          console.warn("Failed to parse value as JSON, using as string");
        }
      }

      const { error } = await supabase
        .from("custom_rules")
        .update({
          type: editedRule.type,
          name: editedRule.name,
          description: editedRule.description,
          value: parsedValue,
        })
        .eq("id", editingRule.id);

      if (error) throw error;

      toast.success("Rule updated successfully");
      setIsEditRuleOpen(false);
      setEditingRule(null);
      setEditedRule({ type: "", name: "", description: "", value: "" });
    } catch (err) {
      console.error("Error updating rule:", err);
      toast.error("Failed to update rule. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle rule deletion
  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("custom_rules")
        .delete()
        .eq("id", ruleToDelete.id);

      if (error) throw error;

      toast.success("Rule deleted successfully");
      setRuleToDelete(null);
    } catch (err) {
      console.error("Error deleting rule:", err);
      toast.error("Failed to delete rule. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add delete variant function
  const handleDeleteVariant = async (variant: HeadlineVariant) => {
    try {
      const { error } = await supabase
        .from("headline_variants")
        .delete()
        .eq("id", variant.id);

      if (error) {
        throw error;
      }

      toast.success("Variant deleted successfully");
      setVariantToDelete(null);
    } catch (error) {
      console.error("Error deleting variant:", error);
      toast.error("Failed to delete variant");
    }
  };

  return (
    <div className="bg-background overflow-hidden overflow-y-clip overscroll-y-none">
      <div className="max-w-[1600px] mx-auto p-4">
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
                                  preserveAspectRatio={true}
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
                    <CardTitle className="text-xl">
                      {selectedAd ? "Ad Details" : "Automations"}
                    </CardTitle>
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
                        <div className="space-y-8">
                          {/* Ad Preview */}
                          <div className="space-y-4">
                            <h3 className="text-sm font-medium">Ad Preview</h3>
                            <div className="w-full flex items-center justify-center border rounded-lg">
                              <AdImage
                                src={selectedAd.mr_image_url}
                                alt="Ad preview"
                                className="w-full max-w-[600px]"
                                preserveAspectRatio={false}
                              />
                            </div>
                          </div>

                          {/* Generated Variants Section */}
                          {headlineVariants.filter(
                            (variant) =>
                              variant.image_url === selectedAd.mr_image_url
                          ).length > 0 && (
                            <div className="space-y-4">
                              <h3 className="text-sm font-medium">
                                Generated Variants
                              </h3>

                              {/* Table View */}
                              <Card>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[100px]">
                                        Variant
                                      </TableHead>
                                      {headlineVariants
                                        .filter(
                                          (variant) =>
                                            variant.image_url ===
                                            selectedAd.mr_image_url
                                        )
                                        .slice(0, 1)
                                        .map((firstVariant) =>
                                          firstVariant.original_headlines.map(
                                            (_, index) => (
                                              <TableHead key={index}>
                                                Headline {index + 1}
                                              </TableHead>
                                            )
                                          )
                                        )}
                                      <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {/* Original Headlines Row */}
                                    {headlineVariants
                                      .filter(
                                        (variant) =>
                                          variant.image_url ===
                                          selectedAd.mr_image_url
                                      )
                                      .slice(0, 1)
                                      .map((firstVariant) => (
                                        <TableRow key="original">
                                          <TableCell className="font-medium">
                                            Original
                                          </TableCell>
                                          {firstVariant.original_headlines.map(
                                            (headline, index) => (
                                              <TableCell key={index}>
                                                <div className="space-y-1">
                                                  <p>{headline.text}</p>
                                                  <span className="text-xs text-muted-foreground">
                                                    {headline.type}
                                                  </span>
                                                </div>
                                              </TableCell>
                                            )
                                          )}
                                        </TableRow>
                                      ))}

                                    {/* Variant Rows */}
                                    {headlineVariants
                                      .filter(
                                        (variant) =>
                                          variant.image_url ===
                                          selectedAd.mr_image_url
                                      )
                                      .map((variant, variantIndex) => (
                                        <TableRow
                                          key={variant.id}
                                          className="cursor-pointer hover:bg-muted/50"
                                          onClick={() =>
                                            setSelectedVariant(variant)
                                          }
                                        >
                                          <TableCell className="font-medium">
                                            Variant {variantIndex + 1}
                                          </TableCell>
                                          {variant.new_headlines.map(
                                            (headline, index) => (
                                              <TableCell key={index}>
                                                <div className="space-y-1">
                                                  <p>{headline.text}</p>
                                                  <span className="text-xs text-muted-foreground">
                                                    {headline.type}
                                                  </span>
                                                </div>
                                              </TableCell>
                                            )
                                          )}
                                          <TableCell>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setVariantToDelete(variant);
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                  </TableBody>
                                </Table>
                              </Card>

                              {/* Variant Details Dialog */}
                              <Dialog
                                open={!!selectedVariant}
                                onOpenChange={(open) =>
                                  !open && setSelectedVariant(null)
                                }
                              >
                                <DialogContent className="max-w-4xl max-h-[90dvh] flex flex-col overflow-hidden p-0">
                                  <DialogHeader className="px-6 py-4 border-b bg-background">
                                    <DialogTitle>Variant Details</DialogTitle>
                                    <DialogDescription>
                                      Detailed information about the selected
                                      headline variant
                                    </DialogDescription>
                                  </DialogHeader>

                                  <div className="flex-1 overflow-y-auto">
                                    <div className="px-6 py-6">
                                      {selectedVariant && (
                                        <div className="space-y-8">
                                          {/* Ad Preview */}
                                          <div className="space-y-4">
                                            <h3 className="text-sm font-medium">
                                              Ad Preview
                                            </h3>
                                            <AdImage
                                              src={selectedVariant.image_url}
                                              alt="Ad preview"
                                              className="w-full"
                                              preserveAspectRatio={false}
                                              new_headlines={
                                                selectedVariant.new_headlines
                                              }
                                              handleBoundingBoxClick={(
                                                headline
                                              ) => {
                                                // Find the index of the clicked headline
                                                const index =
                                                  selectedVariant.new_headlines.findIndex(
                                                    (h) =>
                                                      h.text === headline.text
                                                  );
                                                if (index !== -1) {
                                                  setCurrentHeadlineIndex(
                                                    index
                                                  );
                                                }
                                              }}
                                            />
                                          </div>

                                          {/* Headlines Comparison with Pagination */}
                                          <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                              <h3 className="text-sm font-medium">
                                                Headlines Comparison
                                              </h3>
                                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>
                                                  {currentHeadlineIndex + 1} of{" "}
                                                  {
                                                    selectedVariant
                                                      .new_headlines.length
                                                  }
                                                </span>
                                                <div className="flex items-center gap-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    disabled={
                                                      currentHeadlineIndex === 0
                                                    }
                                                    onClick={() =>
                                                      setCurrentHeadlineIndex(
                                                        (prev) => prev - 1
                                                      )
                                                    }
                                                  >
                                                    <ChevronLeft className="h-4 w-4" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    disabled={
                                                      currentHeadlineIndex ===
                                                      selectedVariant
                                                        .new_headlines.length -
                                                        1
                                                    }
                                                    onClick={() =>
                                                      setCurrentHeadlineIndex(
                                                        (prev) => prev + 1
                                                      )
                                                    }
                                                  >
                                                    <ChevronRight className="h-4 w-4" />
                                                  </Button>
                                                </div>
                                              </div>
                                            </div>

                                            {/* Current Headline Card */}
                                            <Card className="p-4">
                                              <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                  <div>
                                                    <h4 className="text-xs font-medium text-muted-foreground mb-2">
                                                      Original Headline
                                                    </h4>
                                                    <div className="p-3 rounded-md bg-muted/50">
                                                      <p className="text-sm">
                                                        {
                                                          selectedVariant
                                                            .new_headlines[
                                                            currentHeadlineIndex
                                                          ].original
                                                        }
                                                      </p>
                                                      <span className="text-xs text-muted-foreground mt-1 block">
                                                        {
                                                          selectedVariant
                                                            .original_headlines[
                                                            currentHeadlineIndex
                                                          ]?.type
                                                        }
                                                      </span>
                                                    </div>
                                                  </div>
                                                  <div>
                                                    <h4 className="text-xs font-medium text-muted-foreground mb-2">
                                                      New Headline
                                                    </h4>
                                                    <div className="p-3 rounded-md bg-primary/5 border-primary/10 border">
                                                      <p className="text-sm">
                                                        {
                                                          selectedVariant
                                                            .new_headlines[
                                                            currentHeadlineIndex
                                                          ].text
                                                        }
                                                      </p>
                                                      <span className="text-xs text-muted-foreground mt-1 block">
                                                        {
                                                          selectedVariant
                                                            .new_headlines[
                                                            currentHeadlineIndex
                                                          ].type
                                                        }
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 pt-4">
                                                  <div className="space-y-3">
                                                    <div>
                                                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                                                        Improvements
                                                      </h4>
                                                      <ul className="list-disc list-inside space-y-1">
                                                        {selectedVariant.new_headlines[
                                                          currentHeadlineIndex
                                                        ].improvements.map(
                                                          (improvement, i) => (
                                                            <li
                                                              key={i}
                                                              className="text-sm"
                                                            >
                                                              {improvement}
                                                            </li>
                                                          )
                                                        )}
                                                      </ul>
                                                    </div>
                                                    <div>
                                                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                                                        Expected Impact
                                                      </h4>
                                                      <ul className="list-disc list-inside space-y-1">
                                                        {selectedVariant.new_headlines[
                                                          currentHeadlineIndex
                                                        ].expected_impact.map(
                                                          (impact, i) => (
                                                            <li
                                                              key={i}
                                                              className="text-sm"
                                                            >
                                                              {impact}
                                                            </li>
                                                          )
                                                        )}
                                                      </ul>
                                                    </div>
                                                  </div>
                                                  <div className="space-y-3">
                                                    <div>
                                                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                                                        Target Audience
                                                      </h4>
                                                      <ul className="list-disc list-inside space-y-1">
                                                        {selectedVariant.new_headlines[
                                                          currentHeadlineIndex
                                                        ].target_audience.map(
                                                          (audience, i) => (
                                                            <li
                                                              key={i}
                                                              className="text-sm"
                                                            >
                                                              {audience}
                                                            </li>
                                                          )
                                                        )}
                                                      </ul>
                                                    </div>
                                                    <div>
                                                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                                                        Pain Points Addressed
                                                      </h4>
                                                      <ul className="list-disc list-inside space-y-1">
                                                        {selectedVariant.new_headlines[
                                                          currentHeadlineIndex
                                                        ].pain_points_addressed.map(
                                                          (point, i) => (
                                                            <li
                                                              key={i}
                                                              className="text-sm"
                                                            >
                                                              {point}
                                                            </li>
                                                          )
                                                        )}
                                                      </ul>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            </Card>
                                          </div>

                                          {/* Rules Used Section */}
                                          <div className="space-y-4">
                                            <div className="sticky top-0 bg-background pt-4 pb-2 -mx-6 px-6 border-b z-10">
                                              <h3 className="text-sm font-medium">
                                                Rules Applied
                                              </h3>
                                            </div>
                                            <div className="grid grid-cols-4 gap-3">
                                              {selectedVariant.rules_used.map(
                                                (rule, index) => (
                                                  <Card
                                                    key={index}
                                                    className="p-3"
                                                  >
                                                    <div className="space-y-2">
                                                      <div className="flex items-center justify-between gap-2">
                                                        <h4 className="text-sm font-medium">
                                                          {rule.name}
                                                        </h4>
                                                        <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                                                          {rule.type}
                                                        </span>
                                                      </div>
                                                      <p className="text-xs text-muted-foreground">
                                                        {rule.description}
                                                      </p>
                                                    </div>
                                                  </Card>
                                                )
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="px-6 py-4 border-t bg-background mt-auto">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                      <span>
                                        Created:{" "}
                                        {selectedVariant &&
                                          new Date(
                                            selectedVariant.created_at
                                          ).toLocaleString()}
                                      </span>
                                      <span>
                                        Last Updated:{" "}
                                        {selectedVariant &&
                                          new Date(
                                            selectedVariant.updated_at
                                          ).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          )}

                          {/* Automation Actions */}
                          <div className="space-y-4">
                            <h3 className="text-sm font-medium">
                              Available Automations
                            </h3>
                            <Card className="p-6">
                              <div className="flex flex-col items-center justify-center text-center">
                                <Settings className="h-12 w-12 text-muted-foreground/60 mb-4" />
                                <h3 className="text-lg font-medium mb-2">
                                  Create New Automation
                                </h3>
                                <p className="text-muted-foreground text-sm max-w-lg mb-4">
                                  Choose an automation type to generate
                                  optimized content for your ad.
                                </p>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button className="gap-2">
                                      <Plus className="h-4 w-4" />
                                      Create Automation
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="start"
                                    className="w-64"
                                  >
                                    <DropdownMenuItem
                                      className="flex items-center"
                                      onSelect={() =>
                                        setIsRuleSelectionOpen(true)
                                      }
                                    >
                                      <Settings className="h-4 w-4 mr-2" />
                                      Generate Headline Variants
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </Card>
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
          <TabsContent value="rules" className="pb-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="space-y-8">
                {/* Custom Rules Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Custom Rules</h2>
                      <p className="text-sm text-muted-foreground">
                        Define your own rules and guidelines for content
                        generation
                      </p>
                    </div>
                    <Button
                      className="gap-2"
                      onClick={() => setIsAddRuleOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Add Rule
                    </Button>
                  </div>

                  {isLoadingRules ? (
                    <div className="flex justify-center items-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
                        <span className="text-sm text-muted-foreground">
                          Loading rules...
                        </span>
                      </div>
                    </div>
                  ) : rulesError ? (
                    <div className="bg-destructive/10 p-4 rounded-lg text-destructive text-sm">
                      <div className="font-medium mb-1">
                        Error loading rules
                      </div>
                      <p className="text-destructive/80 text-xs mb-3">
                        {rulesError}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchRules}
                        className="w-full"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : customRules.length === 0 ? (
                    <Card className="p-6">
                      <div className="flex flex-col items-center justify-center text-center">
                        <Settings className="h-12 w-12 text-muted-foreground/60 mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          No Custom Rules
                        </h3>
                        <p className="text-muted-foreground text-sm max-w-md mb-4">
                          Create custom rules to define specific guidelines for
                          your content generation.
                        </p>
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() => setIsAddRuleOpen(true)}
                        >
                          <Plus className="h-4 w-4" />
                          Add Your First Rule
                        </Button>
                      </div>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {customRules.map((rule) => (
                        <Card key={rule.id} className="p-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-medium truncate flex-1">
                                {rule.name}
                              </h4>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                                  onClick={() => {
                                    setEditingRule(rule);
                                    setEditedRule({
                                      type: rule.type as RuleType,
                                      name: rule.name,
                                      description: rule.description,
                                      value:
                                        typeof rule.value === "object"
                                          ? JSON.stringify(rule.value, null, 2)
                                          : String(rule.value),
                                    });
                                    setIsEditRuleOpen(true);
                                  }}
                                >
                                  <Settings className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={() => setRuleToDelete(rule)}
                                >
                                  <CircleX className="h-3 w-3" />
                                </Button>
                                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] whitespace-nowrap">
                                  {rule.type}
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {rule.description}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] font-medium text-muted-foreground">
                                Value
                              </span>
                              {Array.isArray(rule.value) ? (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {rule.value.map((item, i) => (
                                    <span
                                      key={i}
                                      className="px-1.5 py-0.5 rounded-full bg-muted text-[10px]"
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-0.5">
                                  {typeof rule.value === "object" ? (
                                    <pre className="p-1.5 rounded-lg bg-muted font-mono text-[10px] overflow-x-auto max-h-[60px]">
                                      {JSON.stringify(rule.value, null, 2)}
                                    </pre>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] inline-block">
                                      {String(rule.value)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Brand Material Rules Section */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Brand Material Rules
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Rules extracted from your brand materials and guidelines
                    </p>
                  </div>

                  {isLoadingRules ? (
                    <div className="flex justify-center items-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
                        <span className="text-sm text-muted-foreground">
                          Loading brand rules...
                        </span>
                      </div>
                    </div>
                  ) : rulesError ? (
                    <div className="bg-destructive/10 p-4 rounded-lg text-destructive text-sm">
                      <div className="font-medium mb-1">
                        Error loading brand rules
                      </div>
                      <p className="text-destructive/80 text-xs mb-3">
                        {rulesError}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchRules}
                        className="w-full"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : brandMaterials.length === 0 ? (
                    <Card className="p-6">
                      <div className="flex flex-col items-center justify-center text-center">
                        <Scroll className="h-12 w-12 text-muted-foreground/60 mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          No Brand Materials
                        </h3>
                        <p className="text-muted-foreground text-sm max-w-md">
                          Add brand materials to automatically extract content
                          rules and guidelines.
                        </p>
                      </div>
                    </Card>
                  ) : (
                    <div className="space-y-6">
                      {brandMaterials.map((material) => (
                        <Card key={material.id} className="overflow-hidden">
                          <div className="bg-muted/50 px-4 py-3 border-b">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-sm font-medium truncate">
                                  {material.material_url}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {material.content_rules.length} rules from{" "}
                                  {material.material_type} material
                                </p>
                              </div>
                              <a
                                href={material.material_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {material.content_rules.map((rule, index) => (
                                <Card key={index} className="p-3">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <h4 className="text-sm font-medium truncate flex-1">
                                        {rule.name}
                                      </h4>
                                      <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] whitespace-nowrap">
                                        {rule.type}
                                      </span>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                        {rule.description}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-medium text-muted-foreground">
                                        Value
                                      </span>
                                      {Array.isArray(rule.value) ? (
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          {rule.value.map((item, i) => (
                                            <span
                                              key={i}
                                              className="px-1.5 py-0.5 rounded-full bg-muted text-[10px]"
                                            >
                                              {item}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="mt-0.5">
                                          {typeof rule.value === "object" ? (
                                            <pre className="p-1.5 rounded-lg bg-muted font-mono text-[10px] overflow-x-auto max-h-[60px]">
                                              {JSON.stringify(
                                                rule.value,
                                                null,
                                                2
                                              )}
                                            </pre>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] inline-block">
                                              {String(rule.value)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Rule Dialog */}
      <Dialog open={isAddRuleOpen} onOpenChange={setIsAddRuleOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Add New Rule</DialogTitle>
            <DialogDescription>
              Create a new rule to define guidelines for your content
              generation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="type">Rule Type</Label>
              <Select
                value={newRule.type}
                onValueChange={(value) =>
                  setNewRule((prev) => ({ ...prev, type: value as RuleType }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rule type" />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newRule.name}
                onChange={(e) =>
                  setNewRule((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter rule name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newRule.description}
                onChange={(e) =>
                  setNewRule((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Describe the purpose and application of this rule"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="value">Value</Label>
              <Textarea
                id="value"
                value={newRule.value}
                onChange={(e) =>
                  setNewRule((prev) => ({ ...prev, value: e.target.value }))
                }
                placeholder="Enter value (string, number, or JSON array/object)"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                For arrays use: [&quot;item1&quot;, &quot;item2&quot;] <br />
                For objects use: {"{"}key: &quot;value&quot;{"}"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddRuleOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateRule} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Rule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Edit Rule Dialog */}
      <Dialog open={isEditRuleOpen} onOpenChange={setIsEditRuleOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Edit Rule</DialogTitle>
            <DialogDescription>
              Modify the existing rule&apos;s settings and values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-type">Rule Type</Label>
              <Select
                value={editedRule.type}
                onValueChange={(value) =>
                  setEditedRule((prev) => ({
                    ...prev,
                    type: value as RuleType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rule type" />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editedRule.name}
                onChange={(e) =>
                  setEditedRule((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter rule name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editedRule.description}
                onChange={(e) =>
                  setEditedRule((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Describe the purpose and application of this rule"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-value">Value</Label>
              <Textarea
                id="edit-value"
                value={editedRule.value}
                onChange={(e) =>
                  setEditedRule((prev) => ({ ...prev, value: e.target.value }))
                }
                placeholder="Enter value (string, number, or JSON array/object)"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                For arrays use: [&quot;item1&quot;, &quot;item2&quot;] <br />
                For objects use: {"{"}key: &quot;value&quot;{"}"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditRuleOpen(false);
                setEditingRule(null);
                setEditedRule({
                  type: "",
                  name: "",
                  description: "",
                  value: "",
                });
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleEditRule} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Rule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Delete Rule Dialog */}
      <Dialog
        open={!!ruleToDelete}
        onOpenChange={(open) => !open && setRuleToDelete(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this rule? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {ruleToDelete && (
              <Card className="p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium truncate">
                      {ruleToDelete.name}
                    </h4>
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">
                      {ruleToDelete.type}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ruleToDelete.description}
                  </p>
                </div>
              </Card>
            )}
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setRuleToDelete(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRule}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Rule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rule Selection Dialog */}
      <Dialog open={isRuleSelectionOpen} onOpenChange={setIsRuleSelectionOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Rules to Apply</DialogTitle>
            <DialogDescription>
              Choose which rules to consider when generating headline variants.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 py-4">
              {/* Add variant count input */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="variant-count">Number of Variants</Label>
                  <Input
                    id="variant-count"
                    type="number"
                    min={1}
                    max={10}
                    value={variantCount}
                    onChange={(e) =>
                      setVariantCount(parseInt(e.target.value) || 1)
                    }
                    className="w-24"
                  />
                </div>
              </div>

              {/* Existing rule selection content */}
              {isLoadingRules ? (
                <div className="flex justify-center items-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
                    <span className="text-sm text-muted-foreground">
                      Loading rules...
                    </span>
                  </div>
                </div>
              ) : rulesError ? (
                <div className="bg-destructive/10 p-4 rounded-lg text-destructive text-sm">
                  <div className="font-medium mb-1">Error loading rules</div>
                  <p className="text-destructive/80 text-xs mb-3">
                    {rulesError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchRules}
                    className="w-full"
                  >
                    Retry
                  </Button>
                </div>
              ) : customRules.length === 0 && brandMaterials.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No rules available. Create some rules first.
                  </p>
                </div>
              ) : (
                <>
                  {/* Custom Rules Section */}
                  {customRules.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">Custom Rules</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const newSelection = { ...selectedRules };
                            const areAllSelected = customRules.every(
                              (rule) => selectedRules[`custom-${rule.id}`]
                            );
                            customRules.forEach((rule) => {
                              newSelection[`custom-${rule.id}`] =
                                !areAllSelected;
                            });
                            setSelectedRules(newSelection);
                          }}
                        >
                          {customRules.every(
                            (rule) => selectedRules[`custom-${rule.id}`]
                          )
                            ? "Deselect All"
                            : "Select All"}
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {customRules.map((rule) => (
                          <Card key={rule.id} className="p-2">
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                id={`custom-${rule.id}`}
                                checked={
                                  selectedRules[`custom-${rule.id}`] ?? true
                                }
                                onChange={(e) =>
                                  setSelectedRules((prev) => ({
                                    ...prev,
                                    [`custom-${rule.id}`]: e.target.checked,
                                  }))
                                }
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <label
                                  htmlFor={`custom-${rule.id}`}
                                  className="text-xs font-medium block truncate cursor-pointer"
                                >
                                  {rule.name}
                                </label>
                                <span className="text-[10px] text-muted-foreground block truncate">
                                  {rule.description}
                                </span>
                                <span className="text-[10px] text-primary mt-0.5 inline-block px-1.5 py-0.5 rounded-full bg-primary/10">
                                  {rule.type}
                                </span>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Brand Material Rules Section */}
                  {brandMaterials.map((material) => (
                    <div key={material.id} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium truncate">
                            Rules from {formatUrl(material.material_url)}
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            ({material.content_rules.length})
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const newSelection = { ...selectedRules };
                            const areAllSelected = material.content_rules.every(
                              (_, index) =>
                                selectedRules[
                                  `material-${material.id}-${index}`
                                ]
                            );
                            material.content_rules.forEach((_, index) => {
                              newSelection[`material-${material.id}-${index}`] =
                                !areAllSelected;
                            });
                            setSelectedRules(newSelection);
                          }}
                        >
                          {material.content_rules.every(
                            (_, index) =>
                              selectedRules[`material-${material.id}-${index}`]
                          )
                            ? "Deselect All"
                            : "Select All"}
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {material.content_rules.map((rule, index) => (
                          <Card key={index} className="p-2">
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                id={`material-${material.id}-${index}`}
                                checked={
                                  selectedRules[
                                    `material-${material.id}-${index}`
                                  ] ?? true
                                }
                                onChange={(e) =>
                                  setSelectedRules((prev) => ({
                                    ...prev,
                                    [`material-${material.id}-${index}`]:
                                      e.target.checked,
                                  }))
                                }
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <label
                                  htmlFor={`material-${material.id}-${index}`}
                                  className="text-xs font-medium block truncate cursor-pointer"
                                >
                                  {rule.name}
                                </label>
                                <span className="text-[10px] text-muted-foreground block truncate">
                                  {rule.description}
                                </span>
                                <span className="text-[10px] text-primary mt-0.5 inline-block px-1.5 py-0.5 rounded-full bg-primary/10">
                                  {rule.type}
                                </span>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setIsRuleSelectionOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                // Get selected rules
                const selectedRulesList = [
                  ...customRules.filter(
                    (rule) => selectedRules[`custom-${rule.id}`] ?? true
                  ),
                  ...brandMaterials.flatMap((material) =>
                    material.content_rules.filter(
                      (_, index) =>
                        selectedRules[`material-${material.id}-${index}`]
                    )
                  ),
                ];

                setIsRuleSelectionOpen(false);
                setGeneratingVariants(true);
                setGeneratedCount(0);

                // Create array of promises for each variant
                const generatePromises = Array(variantCount)
                  .fill(null)
                  .map(() =>
                    fetch("/api/generate-headline-variants", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        imageUrl: selectedAd?.mr_image_url,
                        contentRules: selectedRulesList,
                      }),
                    }).then(async (response) => {
                      const data = await response.json();
                      if (!response.ok) {
                        // Handle specific error cases
                        if (response.status === 400) {
                          if (
                            data.error === "No headlines found in the image"
                          ) {
                            throw new Error(
                              "No headlines could be detected in this ad image"
                            );
                          }
                          if (data.error === "Image URL is required") {
                            throw new Error("Please select an ad first");
                          }
                        }
                        throw new Error(
                          data.error || "Failed to generate variant"
                        );
                      }
                      setGeneratedCount((prev) => prev + 1);
                      return data;
                    })
                  );

                // Show progress toast
                toast.promise(Promise.all(generatePromises), {
                  loading: (
                    <div className="flex items-start gap-4">
                      <AdImage
                        src={selectedAd?.mr_image_url}
                        alt="Ad preview"
                        size={40}
                        className="rounded-sm"
                      />
                      <div className="space-y-2">
                        <h3 className="font-medium">
                          Generating Headline Variants
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Generated {generatedCount} of {variantCount}
                          variants...
                        </p>
                        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-300"
                            style={{
                              width: `${
                                (generatedCount / variantCount) * 100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ),
                  success: () => {
                    setGeneratingVariants(false);
                    return (
                      <div className="flex items-start gap-4">
                        <AdImage
                          src={selectedAd?.mr_image_url}
                          alt="Ad preview"
                          size={40}
                          className="rounded-sm"
                        />
                        <div className="space-y-1">
                          <h3 className="font-medium">
                            Variants Generated Successfully
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {variantCount} variants created based on{" "}
                            {selectedRulesList.length} rules
                          </p>
                        </div>
                      </div>
                    );
                  },
                  error: (err) => {
                    setGeneratingVariants(false);
                    const errorMessage =
                      err instanceof Error
                        ? err.message
                        : "An unexpected error occurred";

                    // Show a separate error toast with the message
                    toast.error(errorMessage, {
                      description:
                        err instanceof Error &&
                        err.message ===
                          "No headlines could be detected in this ad image"
                          ? "Try selecting a different ad or ensure the image contains visible text."
                          : undefined,
                    });

                    // Return null to prevent duplicate toast
                    return null;
                  },
                });
              }}
              disabled={generatingVariants}
            >
              {generatingVariants ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Variants"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Delete Variant Dialog */}
      <AlertDialog
        open={!!variantToDelete}
        onOpenChange={() => setVariantToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this variant and all its associated
              data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                variantToDelete && handleDeleteVariant(variantToDelete)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
