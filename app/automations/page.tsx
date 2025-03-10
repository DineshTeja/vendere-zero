"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  CircleX,
  Loader2,
  Settings,
  Scroll,
  Plus,
  ExternalLink,
  LayoutGrid,
  Clock,
  MoreHorizontal,
  ArrowLeft,
  Tag,
  Shield,
  Paintbrush,
  MessageSquare,
  FileText,
  Users,
  Mail,
} from "lucide-react";
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import VariantsDisplay from "./VariantsDisplay";
import AdImage from "./AdImage";

type OriginalHeadline = {
  text: string;
  type: string;
  visual_context: string;
};

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
  overall_success_likelihood: { metric: number; reason: string };
  predicted_impressions: { metric: number; reason: string };
  predicted_clicks: { metric: number; reason: string };
  predicted_ctr: { metric: number; reason: string };
  predicted_conversions: { metric: number; reason: string };
};

type OriginalAdMetrics = {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
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

  // Get the original metrics for the selected ad
  const [originalMetrics, setOriginalMetrics] =
    useState<OriginalAdMetrics | null>(null);

  useEffect(() => {
    const fetchOriginalMetrics = async () => {
      if (!selectedAd) {
        setOriginalMetrics(null);
        return;
      }

      try {
        const { data: libraryData, error: libraryError } = await supabase
          .from("library_items")
          .select("*")
          .eq("preview_url", selectedAd.li_preview_url)
          .single();

        if (libraryError) {
          console.error("Error fetching library item:", libraryError);
          setOriginalMetrics(null);
          return;
        }

        if (!libraryData) {
          console.error("No library item found for the selected ad");
          setOriginalMetrics(null);
          return;
        }

        const { data, error } = await supabase
          .from("enhanced_ad_metrics")
          .select("impressions, clicks, ctr, conversions")
          .eq("ad_id", libraryData.id)
          .single();

        if (error) {
          console.error("Error fetching original metrics:", error);
          setOriginalMetrics(null);
          return;
        }

        if (!data) {
          console.error("No original metrics found for the selected ad");
          setOriginalMetrics(null);
          return;
        }

        setOriginalMetrics(data);
      } catch (err) {
        console.error("Error fetching original metrics:", err);
        setOriginalMetrics(null);
      }
    };

    fetchOriginalMetrics();
  }, [selectedAd]);

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

  const automations = [
    {
      id: "auto-1",
      prompt: "Generate variants of our Instagram display ads for athleisure",
      status: "in_progress",
      created_at: "2024-03-11T14:30:00Z",
      results: 17,
      type: "variant_generation",
      category: "Social Media Ads",
      sources: ["Meta Ads Manager", "Semrush", "Shopify"],
      channels: ["Instagram", "Facebook"]
    },
    {
      id: "auto-2",
      prompt: "Personalize homepage hero section based on user behavior",
      status: "active",
      created_at: "2024-03-11T09:15:00Z",
      results: 3,
      type: "website_personalization",
      category: "Homepage",
      sources: ["Google Analytics", "Segment", "Hubspot"],
      channels: ["Website"]
    },
    {
      id: "auto-3",
      prompt: "Cart abandonment email sequence optimization",
      status: "scheduled",
      created_at: "2024-03-11T09:15:00Z",
      results: 5,
      type: "email_followup",
      category: "Cart Recovery",
      sources: ["Klaviyo", "Shopify", "Segment"],
      channels: ["Email"]
    },
    {
      id: "auto-4",
      prompt: "Generate Facebook ad creative for holiday sale",
      status: "active",
      created_at: "2024-03-11T09:15:00Z",
      results: 15,
      type: "variant_generation",
      category: "Social Media Ads",
      sources: ["Meta Ads Manager", "Shopify", "Hubspot"],
      channels: ["Facebook", "Instagram"]
    },
    {
      id: "auto-5",
      prompt: "Product recommendation personalization for returning customers",
      status: "active",
      created_at: "2024-03-11T09:15:00Z",
      results: 7,
      type: "website_personalization",
      category: "Product Recommendations",
      sources: ["Shopify", "Segment", "Google Analytics"],
      channels: ["Website", "Email"]
    },
    {
      id: "auto-6",
      prompt: "Post-purchase follow-up email sequence",
      status: "scheduled",
      created_at: "2024-03-11T09:15:00Z",
      results: 4,
      type: "email_followup",
      category: "Customer Retention",
      sources: ["Klaviyo", "Shopify", "Hubspot"],
      channels: ["Email"]
    },
    {
      id: "auto-7",
      prompt: "Landing page content personalization by traffic source",
      status: "active",
      created_at: "2024-03-11T09:15:00Z",
      results: 4,
      type: "website_personalization",
      category: "Landing Pages",
      sources: ["Google Analytics", "Hubspot", "Optimizely"],
      channels: ["Website"]
    },
    {
      id: "auto-8",
      prompt: "Generate Google Ads headline combinations for B2B software",
      status: "active",
      created_at: "2024-03-11T09:15:00Z",
      results: 18,
      type: "variant_generation",
      category: "Search Ads",
      sources: ["Google Ads", "Semrush", "Hubspot"],
      channels: ["Google Search", "Google Display"]
    },
    {
      id: "auto-9",
      prompt: "Browse abandonment email recovery sequence",
      status: "failed",
      created_at: "2024-03-11T09:15:00Z",
      results: 0,
      type: "email_followup",
      category: "Browse Recovery",
      sources: ["Klaviyo", "Segment", "Shopify"],
      channels: ["Email"]
    }
  ];

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(null);

  const handleAutomationClick = (automationId: string) => {
    setSelectedAutomation(automationId);
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
            <div className="flex items-center gap-2">
              {/* <h1 className="text-2xl font-semibold">
                {activeTab === "automations"
                  ? "Automation Builder"
                  : "Company Rules"}
              </h1> */}
              {activeTab === "automations" && selectedAutomation !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setSelectedAutomation(null)}
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
              {selectedAutomation == null && (
                <p className="text-muted-foreground text-sm">
                  {activeTab === "automations"
                    ? "Create and manage automated workflows for your ad campaigns"
                    : "Define guidelines and constraints for your automation workflows"}
                </p>
              )}
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
          <TabsContent value="automations" className="mt-0 border-none">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >

              {selectedAutomation == null && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    {automations.map((automation) => (
                      <motion.div
                        key={automation.id}
                        className="border bg-muted/50 p-4 hover:bg-muted/60 transition-colors cursor-pointer"
                        whileHover={{ y: -1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex items-center justify-between" onClick={() => handleAutomationClick(automation.id)}>
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="text-sm font-medium">{automation.prompt}</div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{formatDate(automation.created_at)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  {automation.type === 'variant_generation' ? (
                                    <>
                                      <LayoutGrid className="h-3 w-3" />
                                      <span>{automation.results} variants</span>
                                    </>
                                  ) : automation.type === 'website_personalization' ? (
                                    <>
                                      <Users className="h-3 w-3" />
                                      <span>{automation.results} segments</span>
                                    </>
                                  ) : (
                                    <>
                                      <Mail className="h-3 w-3" />
                                      <span>{automation.results} emails</span>
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Tag className="h-3 w-3" />
                                  <span>{automation.category}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-6 mt-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Sources:</span>
                                  <div className="flex gap-2">
                                    {automation.sources.map((source, index) => {
                                      const sourceUrl = source === "Meta Ads Manager" ? "https://business.facebook.com"
                                        : source === "Semrush" ? "https://www.semrush.com"
                                          : source === "Shopify" ? "https://www.shopify.com"
                                            : source === "Google Analytics" ? "https://analytics.google.com"
                                              : source === "Segment" ? "https://segment.com"
                                                : source === "Hubspot" ? "https://www.hubspot.com"
                                                  : source === "Klaviyo" ? "https://www.klaviyo.com"
                                                    : source === "Optimizely" ? "https://www.optimizely.com"
                                                      : source === "Google Ads" ? "https://ads.google.com"
                                                        : "";

                                      return (
                                        <span key={index} className="px-2 py-1 bg-muted text-xs rounded-sm flex items-center gap-1.5">
                                          {sourceUrl && (
                                            <div className="w-4 h-4 rounded-sm overflow-hidden bg-muted flex items-center justify-center">
                                              <img
                                                src={`https://www.google.com/s2/favicons?domain=${sourceUrl}&sz=32`}
                                                alt={source}
                                                className="w-full h-full object-contain"
                                                onError={(e) => {
                                                  const target = e.target as HTMLImageElement;
                                                  target.style.display = 'none';
                                                  target.parentElement!.innerHTML = source.charAt(0);
                                                  target.parentElement!.style.display = 'flex';
                                                  target.parentElement!.style.alignItems = 'center';
                                                  target.parentElement!.style.justifyContent = 'center';
                                                  target.parentElement!.style.backgroundColor = '#f0f0f0';
                                                  target.parentElement!.style.color = '#333';
                                                }}
                                              />
                                            </div>
                                          )}
                                          {source}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Channels:</span>
                                  <div className="flex gap-2">
                                    {automation.channels.map((channel, index) => {
                                      const channelUrl = channel === "Instagram" ? "https://www.instagram.com"
                                        : channel === "Facebook" ? "https://www.facebook.com"
                                          : channel === "Website" ? "https://www.shopify.com"
                                            : channel === "Email" ? "https://www.gmail.com"
                                              : channel === "Google Search" ? "https://www.google.com"
                                                : channel === "Google Display" ? "https://www.google.com"
                                                  : "";

                                      return (
                                        <span key={index} className="px-2 py-1 bg-muted text-xs rounded-sm flex items-center gap-1.5">
                                          {channelUrl && (
                                            <div className="w-4 h-4 rounded-sm overflow-hidden bg-muted flex items-center justify-center">
                                              <img
                                                src={`https://www.google.com/s2/favicons?domain=${channelUrl}&sz=32`}
                                                alt={channel}
                                                className="w-full h-full object-contain"
                                                onError={(e) => {
                                                  const target = e.target as HTMLImageElement;
                                                  target.style.display = 'none';
                                                  target.parentElement!.innerHTML = channel.charAt(0);
                                                  target.parentElement!.style.display = 'flex';
                                                  target.parentElement!.style.alignItems = 'center';
                                                  target.parentElement!.style.justifyContent = 'center';
                                                  target.parentElement!.style.backgroundColor = '#f0f0f0';
                                                  target.parentElement!.style.color = '#333';
                                                }}
                                              />
                                            </div>
                                          )}
                                          {channel}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 text-xs rounded-sm ${automation.status === "active"
                              ? "bg-green-500/10 text-green-700 dark:text-green-400"
                              : automation.status === "in_progress"
                                ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                : automation.status === "scheduled"
                                  ? "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                                  : "bg-red-500/10 text-red-700 dark:text-red-400"
                              }`}>
                              {automation.status}
                            </span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <Button variant="outline" className="w-full border-dashed gap-1 rounded-none" size="sm">
                    <Plus className="h-4 w-4" />
                    <span>New Automation</span>
                  </Button>
                </div>
              )}



              {selectedAutomation == "auto-1" && (
                <VariantsDisplay
                  adVariants={adVariants}
                  headlineVariants={headlineVariants}
                  originalMetrics={originalMetrics}
                  error={error}
                  isLoading={isLoading}
                  selectedAdIndex={selectedAdIndex}
                  setSelectedAdIndex={setSelectedAdIndex}
                  selectedAd={selectedAd}
                  selectedVariant={selectedVariant}
                  setSelectedVariant={setSelectedVariant}
                  fetchAdVariants={fetchAdVariants}
                  setVariantToDelete={setVariantToDelete}
                  currentHeadlineIndex={currentHeadlineIndex}
                  setCurrentHeadlineIndex={setCurrentHeadlineIndex}
                  setIsRuleSelectionOpen={setIsRuleSelectionOpen}
                  automation={automations.find(a => a.id === selectedAutomation)!}
                />
              )}
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
              <div className="space-y-8">
                {/* Custom Rules Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h2 className="text-lg font-medium tracking-tight">Custom Rules</h2>
                      <p className="text-sm text-muted-foreground">
                        Define your own rules and guidelines for content generation
                      </p>
                    </div>
                    <Button
                      onClick={() => setIsAddRuleOpen(true)}
                      className="gap-2 rounded-none"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                      Add Rule
                    </Button>
                  </div>

                  {isLoadingRules ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="border bg-muted/50 p-3">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="h-8 w-8 bg-muted/50 rounded-sm animate-pulse" />
                              <div className="h-4 flex-1 bg-muted/50 rounded-sm animate-pulse" />
                            </div>
                            <div className="space-y-2">
                              <div className="h-3 w-full bg-muted/50 rounded-sm animate-pulse" />
                              <div className="h-3 w-2/3 bg-muted/50 rounded-sm animate-pulse" />
                            </div>
                            <div className="space-y-2">
                              <div className="h-4 w-16 bg-muted/50 rounded-sm animate-pulse" />
                              <div className="flex flex-wrap gap-1">
                                <div className="h-4 w-16 bg-muted/50 rounded-sm animate-pulse" />
                                <div className="h-4 w-20 bg-muted/50 rounded-sm animate-pulse" />
                                <div className="h-4 w-12 bg-muted/50 rounded-sm animate-pulse" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : rulesError ? (
                    <div className="bg-destructive/10 p-4 rounded-sm text-destructive text-sm">
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
                        className="w-full rounded-sm"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : customRules.length === 0 ? (
                    <div className="border bg-muted/50 p-6">
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
                          className="gap-2 rounded-sm"
                          onClick={() => setIsAddRuleOpen(true)}
                        >
                          <Plus className="h-4 w-4" />
                          Add Your First Rule
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {customRules.map((rule) => (
                        <motion.div
                          key={rule.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="border bg-muted/50 p-3 group hover:bg-muted/60 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="p-2 bg-primary/10 rounded-sm">
                                {rule.type === "tone" ? (
                                  <Settings className="h-4 w-4 text-primary" />
                                ) : rule.type === "formatting" ? (
                                  <LayoutGrid className="h-4 w-4 text-primary" />
                                ) : rule.type === "keyword" ? (
                                  <Tag className="h-4 w-4 text-primary" />
                                ) : rule.type === "compliance" ? (
                                  <Shield className="h-4 w-4 text-primary" />
                                ) : rule.type === "style" ? (
                                  <Paintbrush className="h-4 w-4 text-primary" />
                                ) : (
                                  <MessageSquare className="h-4 w-4 text-primary" />
                                )}
                              </div>
                              <h4 className="text-sm font-medium truncate flex-1">
                                {rule.name}
                              </h4>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
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
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                                  onClick={() => setRuleToDelete(rule)}
                                >
                                  <CircleX className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {rule.description}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary text-[10px] whitespace-nowrap">
                                  {rule.type}
                                </span>
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ delay: 0.2 }}
                                  className="h-1.5 w-1.5 rounded-full bg-green-500"
                                />
                              </div>
                            </div>
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              transition={{ duration: 0.2 }}
                              className="space-y-2"
                            >
                              <span className="text-[10px] font-medium text-muted-foreground">
                                Value
                              </span>
                              {Array.isArray(rule.value) ? (
                                <div className="flex flex-wrap gap-1">
                                  {rule.value.map((item, i) => (
                                    <motion.span
                                      key={i}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.1 }}
                                      className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px] hover:bg-muted/80 transition-colors cursor-default"
                                    >
                                      {item}
                                    </motion.span>
                                  ))}
                                </div>
                              ) : (
                                <div>
                                  {typeof rule.value === "object" ? (
                                    <pre className="p-1.5 rounded-sm bg-muted font-mono text-[10px] overflow-x-auto max-h-[60px] hover:bg-muted/80 transition-colors">
                                      {JSON.stringify(rule.value, null, 2)}
                                    </pre>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px] inline-block hover:bg-muted/80 transition-colors cursor-default">
                                      {String(rule.value)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Brand Material Rules Section */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-medium tracking-tight">Brand Material Rules</h2>
                    <p className="text-sm text-muted-foreground">
                      Rules extracted from your brand materials and guidelines
                    </p>
                  </div>

                  {isLoadingRules ? (
                    <div className="space-y-6">
                      {[...Array(2)].map((_, i) => (
                        <div key={i} className="border bg-muted/50">
                          <div className="bg-muted/50 px-4 py-3 border-b">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 bg-muted/50 rounded-sm animate-pulse" />
                                <div className="space-y-2">
                                  <div className="h-4 w-48 bg-muted/50 rounded-sm animate-pulse" />
                                  <div className="h-3 w-32 bg-muted/50 rounded-sm animate-pulse" />
                                </div>
                              </div>
                              <div className="h-8 w-8 bg-muted/50 rounded-sm animate-pulse" />
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {[...Array(4)].map((_, j) => (
                                <div key={j} className="border bg-muted/50 p-3">
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="h-8 w-8 bg-muted/50 rounded-sm animate-pulse" />
                                      <div className="h-4 flex-1 bg-muted/50 rounded-sm animate-pulse" />
                                      <div className="h-4 w-16 bg-muted/50 rounded-sm animate-pulse" />
                                    </div>
                                    <div className="space-y-2">
                                      <div className="h-3 w-full bg-muted/50 rounded-sm animate-pulse" />
                                      <div className="h-3 w-2/3 bg-muted/50 rounded-sm animate-pulse" />
                                    </div>
                                    <div className="space-y-2">
                                      <div className="h-4 w-16 bg-muted/50 rounded-sm animate-pulse" />
                                      <div className="flex flex-wrap gap-1">
                                        <div className="h-4 w-16 bg-muted/50 rounded-sm animate-pulse" />
                                        <div className="h-4 w-20 bg-muted/50 rounded-sm animate-pulse" />
                                        <div className="h-4 w-12 bg-muted/50 rounded-sm animate-pulse" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : rulesError ? (
                    <div className="bg-destructive/10 p-4 rounded-sm text-destructive text-sm">
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
                        className="w-full rounded-sm"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : brandMaterials.length === 0 ? (
                    <div className="border bg-muted/50 p-6">
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
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {brandMaterials.map((material) => (
                        <motion.div
                          key={material.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="border bg-muted/50 group hover:bg-muted/60 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
                        >
                          <div className="bg-muted/50 px-4 py-3 border-b">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-sm">
                                  <FileText className="h-4 w-4 text-primary" />
                                </div>
                                <div className="space-y-2">
                                  <h3 className="text-sm font-medium truncate">
                                    {material.material_url}
                                  </h3>
                                  <p className="text-xs text-muted-foreground">
                                    {material.content_rules.length} rules from{" "}
                                    {material.material_type} material
                                  </p>
                                </div>
                              </div>
                              <motion.a
                                href={material.material_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors p-2 hover:bg-primary/10 rounded-sm"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </motion.a>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {material.content_rules.map((rule, index) => (
                                <motion.div
                                  key={index}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.3, delay: index * 0.05 }}
                                  className="border bg-muted/50 p-3 hover:bg-muted/60 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
                                >
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="p-2 bg-primary/10 rounded-sm">
                                        {rule.type === "tone" ? (
                                          <Settings className="h-4 w-4 text-primary" />
                                        ) : rule.type === "formatting" ? (
                                          <LayoutGrid className="h-4 w-4 text-primary" />
                                        ) : rule.type === "keyword" ? (
                                          <Tag className="h-4 w-4 text-primary" />
                                        ) : rule.type === "compliance" ? (
                                          <Shield className="h-4 w-4 text-primary" />
                                        ) : rule.type === "style" ? (
                                          <Paintbrush className="h-4 w-4 text-primary" />
                                        ) : (
                                          <MessageSquare className="h-4 w-4 text-primary" />
                                        )}
                                      </div>
                                      <h4 className="text-sm font-medium truncate flex-1">
                                        {rule.name}
                                      </h4>
                                      <span className="px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary text-[10px] whitespace-nowrap">
                                        {rule.type}
                                      </span>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                        {rule.description}
                                      </p>
                                    </div>
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      transition={{ duration: 0.2 }}
                                      className="space-y-2"
                                    >
                                      <span className="text-[10px] font-medium text-muted-foreground">
                                        Value
                                      </span>
                                      {Array.isArray(rule.value) ? (
                                        <div className="flex flex-wrap gap-1">
                                          {rule.value.map((item, i) => (
                                            <motion.span
                                              key={i}
                                              initial={{ opacity: 0, x: -10 }}
                                              animate={{ opacity: 1, x: 0 }}
                                              transition={{ delay: i * 0.1 }}
                                              className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px] hover:bg-muted/80 transition-colors cursor-default"
                                            >
                                              {item}
                                            </motion.span>
                                          ))}
                                        </div>
                                      ) : (
                                        <div>
                                          {typeof rule.value === "object" ? (
                                            <pre className="p-1.5 rounded-sm bg-muted font-mono text-[10px] overflow-x-auto max-h-[60px] hover:bg-muted/80 transition-colors">
                                              {JSON.stringify(rule.value, null, 2)}
                                            </pre>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px] inline-block hover:bg-muted/80 transition-colors cursor-default">
                                              {String(rule.value)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </motion.div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
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
                              selectedRules[
                              `material-${material.id}-${index}`
                              ]
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
                        selectedRules[
                        `material-${material.id}-${index}`
                        ]
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
                              width: `${(generatedCount / variantCount) * 100
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
