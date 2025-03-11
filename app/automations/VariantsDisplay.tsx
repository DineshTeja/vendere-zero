import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Eye, Settings, MousePointerClick, Target, Trash2, Play } from "lucide-react";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ReactMarkdown from "react-markdown";
import { Dialog, DialogHeader, DialogContent } from '@/components/ui/dialog';
import remarkGfm from "remark-gfm";
import AdImage from "./AdImage";
import Image from "next/image";
import { useEffect } from "react";

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

// Utility function to format large numbers
const formatCompactNumber = (num: number): string => {
    if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
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

type VariantsDisplayProps = {
    adVariants: AdVariantItem[];
    headlineVariants: HeadlineVariant[];
    originalMetrics: OriginalAdMetrics | null;
    error: string | null;
    isLoading: boolean;
    selectedAdIndex: number | null;
    setSelectedAdIndex: (index: number | null) => void;
    selectedAd: AdVariantItem | null;
    selectedVariant: HeadlineVariant | null;
    setSelectedVariant: (variant: HeadlineVariant | null) => void;
    fetchAdVariants: () => void;
    setVariantToDelete: (variant: HeadlineVariant | null) => void;
    currentHeadlineIndex: number;
    setCurrentHeadlineIndex: (index: number) => void;
    setIsRuleSelectionOpen: (open: boolean) => void;
    automation: {
        id: string;
        prompt: string;
        status: string;
        type: string;
        category: string;
        sources: string[];
        channels: string[];
    };
}

export default function VariantsDisplay({ automation, adVariants, headlineVariants, originalMetrics, error, isLoading, selectedAdIndex, setSelectedAdIndex, selectedAd, selectedVariant, setSelectedVariant, fetchAdVariants, setVariantToDelete, currentHeadlineIndex, setCurrentHeadlineIndex, setIsRuleSelectionOpen }: VariantsDisplayProps) {
    // Auto-select first ad with variants on mount
    useEffect(() => {
        if (!isLoading && !error && adVariants.length > 0 && selectedAdIndex === null) {
            const firstAdWithVariants = adVariants.findIndex(item =>
                headlineVariants.some(variant => variant.image_url === item.mr_image_url)
            );
            if (firstAdWithVariants !== -1) {
                setSelectedAdIndex(firstAdWithVariants);
            }
        }
    }, [isLoading, error, adVariants, headlineVariants, selectedAdIndex, setSelectedAdIndex]);

    return (
        <div
            className="w-full flex overflow-hidden max-h-[1300px]"
            style={{
                height: "calc(100vh - 140px)",
                margin: 0,
                padding: 0,
            }}
        >
            {/* Left Panel - Ad Library */}
            <div className="w-72 border-r border-border/40 flex flex-col overflow-hidden">
                {/* Header - Fixed height */}
                <div className="border-b bg-muted/50 px-4 py-3 h-[80px] flex flex-col justify-between shrink-0">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Inputs</h3>
                    </div>
                    <div className="overflow-y-auto max-h-[60px] scrollbar-hide">
                        <div className="flex flex-wrap gap-1.5">
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
                                            <div className="w-3 h-3 rounded-sm overflow-hidden bg-white flex items-center justify-center">
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

                {/* Subheader for Display Ads */}
                <div className="border-b bg-muted/10 px-4 py-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-xs font-medium">Display Ads</h4>
                            <p className="text-[10px] text-muted-foreground">
                                {adVariants.length > 0
                                    ? `${adVariants.length} ads in library`
                                    : "Browse available ads"}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 max-h-[950px]">
                    <ScrollArea className="h-full py-2">
                        {isLoading ? (
                            <div className="py-2">
                                <div className="px-4 py-1">
                                    <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
                                </div>
                                <div className="px-2 pt-1">
                                    <div className="grid grid-cols-2 gap-2">
                                        {[...Array(4)].map((_, i) => (
                                            <div key={i} className="space-y-2">
                                                <div className="aspect-square bg-muted/50 rounded animate-pulse" />
                                                <div className="h-3 w-3/4 bg-muted/50 rounded animate-pulse" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : error ? (
                            <div className="px-4 py-6">
                                <div className="bg-destructive/10 p-3 rounded-sm text-destructive text-xs">
                                    <div className="font-medium mb-1">
                                        Error loading ads
                                    </div>
                                    <p className="text-destructive/80 mb-3">
                                        {error}
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={fetchAdVariants}
                                        className="w-full text-xs h-8"
                                    >
                                        Retry
                                    </Button>
                                </div>
                            </div>
                        ) : adVariants.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <CircleX className="h-8 w-8 text-muted-foreground/60 mb-3" />
                                <h3 className="text-sm font-medium mb-1">
                                    No ads found
                                </h3>
                                <p className="text-muted-foreground text-xs max-w-xs">
                                    There are no ads available in your library.
                                </p>
                            </div>
                        ) : (
                            <div className="py-2">
                                {/* Ads with variants */}
                                {adVariants.some(item =>
                                    headlineVariants.some(variant => variant.image_url === item.mr_image_url)
                                ) && (
                                        <div className="mb-4">
                                            <div className="px-4 py-1">
                                                <h4 className="text-xs font-medium text-muted-foreground">Ads with variants</h4>
                                            </div>
                                            <div className="px-2 pt-1">
                                                <div className="grid grid-cols-2 gap-2">
                                                    {adVariants
                                                        .filter(item =>
                                                            headlineVariants.some(variant => variant.image_url === item.mr_image_url)
                                                        )
                                                        .map((item) => {
                                                            const adIndex = adVariants.findIndex(ad => ad.mr_id === item.mr_id);
                                                            const variantCount = headlineVariants.filter(
                                                                variant => variant.image_url === item.mr_image_url
                                                            ).length;

                                                            return (
                                                                <div key={item.mr_id} className="relative">
                                                                    <div
                                                                        className={`border rounded-md overflow-hidden ${selectedAdIndex === adIndex
                                                                            ? "border-primary ring-1 ring-primary/30"
                                                                            : "border-border/60 hover:border-border"
                                                                            } transition-colors`}
                                                                    >
                                                                        <AdImage
                                                                            src={item.mr_image_url}
                                                                            alt={item.li_name || "Ad variant"}
                                                                            className={`w-full ${selectedAdIndex === adIndex ? "opacity-100" : "opacity-90 hover:opacity-100"}`}
                                                                            isSelected={selectedAdIndex === adIndex}
                                                                            onClick={() => setSelectedAdIndex(adIndex)}
                                                                            preserveAspectRatio={true}
                                                                        />
                                                                        {/* Variant count badge */}
                                                                        <div className="absolute top-1 right-1 bg-primary/10 text-primary text-xs font-medium rounded-sm px-1.5 py-0.5 flex items-center">
                                                                            {variantCount}
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-1 px-1">
                                                                        <p className="text-xs truncate" title={item.li_name || "Unnamed ad"}>
                                                                            {item.li_name || "Untitled"}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                {/* Ads without variants */}
                                {adVariants.some(item =>
                                    !headlineVariants.some(variant => variant.image_url === item.mr_image_url)
                                ) && (
                                        <div>
                                            <div className="px-4 py-1">
                                                <h4 className="text-xs font-medium text-muted-foreground">Ads without variants</h4>
                                            </div>
                                            <div className="px-2 pt-1">
                                                <div className="grid grid-cols-2 gap-2">
                                                    {adVariants
                                                        .filter(item =>
                                                            !headlineVariants.some(variant => variant.image_url === item.mr_image_url)
                                                        )
                                                        .map((item) => {
                                                            const adIndex = adVariants.findIndex(ad => ad.mr_id === item.mr_id);

                                                            return (
                                                                <div key={item.mr_id} className="relative">
                                                                    <div
                                                                        className={`border rounded-lg overflow-hidden ${selectedAdIndex === adIndex
                                                                            ? "border-primary ring-1 ring-primary/30"
                                                                            : "border-border/60 hover:border-border"
                                                                            } transition-colors bg-muted/30 relative`}
                                                                    >
                                                                        <AdImage
                                                                            src={item.mr_image_url}
                                                                            alt={item.li_name || "Ad variant"}
                                                                            className={`w-full ${selectedAdIndex === adIndex ? "opacity-100" : "opacity-90 hover:opacity-100"}`}
                                                                            isSelected={selectedAdIndex === adIndex}
                                                                            onClick={() => setSelectedAdIndex(adIndex)}
                                                                            preserveAspectRatio={true}
                                                                        />
                                                                        {/* No variants indicator */}
                                                                        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] rounded-sm px-1.5 py-0.5 z-10">
                                                                            No variants
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-1 px-1">
                                                                        <p className="text-xs truncate text-muted-foreground" title={item.li_name || "Untitled"}>
                                                                            {item.li_name || "Untitled"}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </div>

            {/* Right Panel - Detail View */}
            <div className="flex-1 h-full flex flex-col overflow-hidden border-none max-h-[1300px]">
                {/* Header - Fixed height matching left panel */}
                <div className="border-b bg-muted/50 px-6 py-3 h-[80px] flex flex-col justify-between shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{automation.prompt}</p>
                            <span className={`ml-2 px-2 py-1 text-xs rounded-sm ${automation.status === "active"
                                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                : automation.status === "in_progress"
                                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                    : automation.status === "scheduled"
                                        ? "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                                        : "bg-red-500/10 text-red-700 dark:text-red-400"
                                }`}>
                                {automation.status}
                            </span>
                        </div>
                        <span className="text-xs text-muted-foreground bg-black/80 px-1 py-1 rounded-sm flex items-center gap-1.5">
                            <Image src="/favicon.ico" alt="Vendere Intelligence" width={16} height={16} />
                            Vendere Intelligence
                        </span>
                    </div>
                    <div className="overflow-y-auto max-h-[60px] scrollbar-hide">
                        <div className="flex flex-wrap gap-1.5">
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
                                            <div className="w-3 h-3 rounded-sm overflow-hidden bg-white flex items-center justify-center">
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
                </div>

                <div
                    className="overflow-hidden border-none"
                    style={{
                        height: "calc(100% - 74px)",
                        padding: "24px",
                    }}
                >
                    <ScrollArea className="h-full border-none">
                        {isLoading ? (
                            <div className="space-y-8">
                                {/* Ad Preview Skeleton */}
                                <div className="space-y-4">
                                    <div className="h-5 w-24 bg-muted/50 rounded animate-pulse" />
                                    <div className="w-full aspect-video bg-muted/50 rounded animate-pulse" />
                                </div>

                                {/* Table Skeleton */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="h-5 w-32 bg-muted/50 rounded animate-pulse" />
                                        <div className="h-5 w-48 bg-muted/50 rounded animate-pulse" />
                                    </div>
                                    <div className="border rounded-none">
                                        <div className="border-b p-4 bg-muted/50">
                                            <div className="grid grid-cols-4 gap-4">
                                                {[...Array(4)].map((_, i) => (
                                                    <div key={i} className="h-4 bg-muted rounded animate-pulse" />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="grid grid-cols-4 gap-4">
                                                    {[...Array(4)].map((_, j) => (
                                                        <div key={j} className="h-4 bg-muted/50 rounded animate-pulse" />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : selectedAd ? (
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
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-medium">Output</h3>
                                                    <span className="text-sm font-medium text-white bg-[#4EBE96]/20 px-2 py-1 rounded-sm">Variant Generation</span>
                                                </div>
                                            </div>

                                            {/* Table View */}
                                            <Card className="border rounded-none bg-card">
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
                                                            <TableHead className="text-right">
                                                                Success
                                                            </TableHead>
                                                            <TableHead className="text-right">
                                                                CTR
                                                            </TableHead>
                                                            <TableHead className="text-right">
                                                                Metrics
                                                            </TableHead>
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
                                                                    {originalMetrics && (
                                                                        <>
                                                                            <TableCell>
                                                                                {/* Skip success likelihood for original metrics */}
                                                                                <div className="text-xs text-muted-foreground">—</div>
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-full max-w-[100px] h-1.5 bg-muted overflow-hidden">
                                                                                        <div
                                                                                            className={cn(
                                                                                                "h-full transition-all",
                                                                                                originalMetrics.ctr >= 0.05
                                                                                                    ? "bg-green-500"
                                                                                                    : originalMetrics.ctr >= 0.02
                                                                                                        ? "bg-yellow-500"
                                                                                                        : "bg-red-500"
                                                                                            )}
                                                                                            style={{
                                                                                                width: `${originalMetrics.ctr * 1000}%`,
                                                                                            }}
                                                                                        />
                                                                                    </div>
                                                                                    <span className="text-xs tabular-nums font-medium">
                                                                                        {(originalMetrics.ctr * 100).toFixed(2)}%
                                                                                    </span>
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                <div className="space-y-1.5">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <Eye className="h-3 w-3 text-muted-foreground" />
                                                                                        <span className="text-xs tabular-nums font-medium text-foreground">
                                                                                            {formatCompactNumber(originalMetrics.impressions)}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <MousePointerClick className="h-3 w-3 text-muted-foreground" />
                                                                                        <span className="text-xs tabular-nums font-medium text-foreground">
                                                                                            {formatCompactNumber(originalMetrics.clicks)}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <Target className="h-3 w-3 text-muted-foreground" />
                                                                                        <span className="text-xs tabular-nums font-medium text-foreground">
                                                                                            {formatCompactNumber(originalMetrics.conversions)}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            </TableCell>
                                                                        </>
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
                                                                        <TooltipProvider>
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <div className="w-full max-w-[100px] h-1.5 bg-muted overflow-hidden">
                                                                                            <div
                                                                                                className={cn(
                                                                                                    "h-full transition-all",
                                                                                                    variant.overall_success_likelihood.metric >= 75
                                                                                                        ? "bg-green-500"
                                                                                                        : variant.overall_success_likelihood.metric >= 50
                                                                                                            ? "bg-yellow-500"
                                                                                                            : "bg-red-500"
                                                                                                )}
                                                                                                style={{
                                                                                                    width: `${variant.overall_success_likelihood.metric}%`,
                                                                                                }}
                                                                                            />
                                                                                        </div>
                                                                                        <span className="text-xs tabular-nums font-medium">
                                                                                            {variant.overall_success_likelihood.metric.toFixed(1)}%
                                                                                        </span>
                                                                                    </div>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent side="top" className="max-w-[300px] p-3">
                                                                                    <ReactMarkdown>
                                                                                        {variant.overall_success_likelihood.reason}
                                                                                    </ReactMarkdown>
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        </TooltipProvider>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <TooltipProvider>
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <div className="w-full max-w-[100px] h-1.5 bg-muted overflow-hidden">
                                                                                            <div
                                                                                                className={cn(
                                                                                                    "h-full transition-all",
                                                                                                    variant.predicted_ctr.metric >= 5
                                                                                                        ? "bg-green-500"
                                                                                                        : variant.predicted_ctr.metric >= 2
                                                                                                            ? "bg-yellow-500"
                                                                                                            : "bg-red-500"
                                                                                                )}
                                                                                                style={{
                                                                                                    width: `${variant.predicted_ctr.metric * 10}%`,
                                                                                                }}
                                                                                            />
                                                                                        </div>
                                                                                        <span className="text-xs tabular-nums font-medium">
                                                                                            {variant.predicted_ctr.metric.toFixed(2)}%
                                                                                        </span>
                                                                                    </div>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent side="top" className="max-w-[300px] p-3">
                                                                                    <ReactMarkdown>
                                                                                        {variant.predicted_ctr.reason}
                                                                                    </ReactMarkdown>
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        </TooltipProvider>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <div className="space-y-1.5">
                                                                            <TooltipProvider>
                                                                                <Tooltip>
                                                                                    <TooltipTrigger asChild>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <Eye className="h-3 w-3 text-muted-foreground" />
                                                                                            <span className="text-xs tabular-nums font-medium text-foreground">
                                                                                                {formatCompactNumber(variant.predicted_impressions.metric)}
                                                                                            </span>
                                                                                        </div>
                                                                                    </TooltipTrigger>
                                                                                    <TooltipContent side="top" className="max-w-[300px] p-3">
                                                                                        <ReactMarkdown>
                                                                                            {variant.predicted_impressions.reason}
                                                                                        </ReactMarkdown>
                                                                                    </TooltipContent>
                                                                                </Tooltip>
                                                                            </TooltipProvider>
                                                                            <TooltipProvider>
                                                                                <Tooltip>
                                                                                    <TooltipTrigger asChild>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <MousePointerClick className="h-3 w-3 text-muted-foreground" />
                                                                                            <span className="text-xs tabular-nums font-medium text-foreground">
                                                                                                {formatCompactNumber(variant.predicted_clicks.metric)}
                                                                                            </span>
                                                                                        </div>
                                                                                    </TooltipTrigger>
                                                                                    <TooltipContent side="top" className="max-w-[300px] p-3">
                                                                                        <ReactMarkdown>
                                                                                            {variant.predicted_clicks.reason}
                                                                                        </ReactMarkdown>
                                                                                    </TooltipContent>
                                                                                </Tooltip>
                                                                            </TooltipProvider>
                                                                            <TooltipProvider>
                                                                                <Tooltip>
                                                                                    <TooltipTrigger asChild>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <Target className="h-3 w-3 text-muted-foreground" />
                                                                                            <span className="text-xs tabular-nums font-medium text-foreground">
                                                                                                {formatCompactNumber(variant.predicted_conversions.metric)}
                                                                                            </span>
                                                                                        </div>
                                                                                    </TooltipTrigger>
                                                                                    <TooltipContent side="top" className="max-w-[300px] p-3">
                                                                                        <ReactMarkdown>
                                                                                            {variant.predicted_conversions.reason}
                                                                                        </ReactMarkdown>
                                                                                    </TooltipContent>
                                                                                </Tooltip>
                                                                            </TooltipProvider>
                                                                        </div>
                                                                    </TableCell>
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
                                                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
                                                    <DialogHeader className="border-b bg-muted/50 px-4 py-2 flex-shrink-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-muted-foreground bg-[#4EBE96]/20 px-1 py-1 rounded-sm">Variant Details</span>
                                                            <span className="text-xs text-muted-foreground bg-black/80 px-1 py-1 rounded-sm flex items-center gap-1.5">
                                                                <Image src="/favicon.ico" alt="Vendere Intelligence" width={16} height={16} />
                                                                Vendere Intelligence
                                                            </span>
                                                        </div>
                                                    </DialogHeader>

                                                    <div className="flex-1 overflow-y-auto no-scrollbar">
                                                        <div className="px-6 py-6">
                                                            {selectedVariant && (
                                                                <div className="space-y-8">
                                                                    {/* Ad Preview */}
                                                                    <div className="space-y-4">
                                                                        <h3 className="text-sm font-medium">Ad Preview</h3>
                                                                        <div className="w-full flex items-center justify-center border bg-muted/50 rounded-none">
                                                                            <AdImage
                                                                                src={selectedVariant.image_url}
                                                                                alt="Ad preview"
                                                                                className="w-full"
                                                                                preserveAspectRatio={false}
                                                                                new_headlines={selectedVariant.new_headlines}
                                                                                handleBoundingBoxClick={(headline) => {
                                                                                    const index = selectedVariant.new_headlines.findIndex(
                                                                                        (h) => h.text === headline.text
                                                                                    );
                                                                                    if (index !== -1) {
                                                                                        setCurrentHeadlineIndex(index);
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* Headlines Comparison with Pagination */}
                                                                    <div className="space-y-4">
                                                                        <div className="flex items-center justify-between">
                                                                            <h3 className="text-sm font-medium">Headlines Comparison</h3>
                                                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                                <span>
                                                                                    {currentHeadlineIndex + 1} of{" "}
                                                                                    {selectedVariant.new_headlines.length}
                                                                                </span>
                                                                                <div className="flex items-center gap-1">
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon"
                                                                                        className="h-8 w-8"
                                                                                        disabled={currentHeadlineIndex === 0}
                                                                                        onClick={() => setCurrentHeadlineIndex(currentHeadlineIndex - 1)}
                                                                                    >
                                                                                        <ChevronLeft className="h-4 w-4" />
                                                                                    </Button>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon"
                                                                                        className="h-8 w-8"
                                                                                        disabled={currentHeadlineIndex === selectedVariant.new_headlines.length - 1}
                                                                                        onClick={() => setCurrentHeadlineIndex(currentHeadlineIndex + 1)}
                                                                                    >
                                                                                        <ChevronRight className="h-4 w-4" />
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Current Headline Card */}
                                                                        <Card className="p-4 border bg-muted/50 rounded-none">
                                                                            <div className="space-y-4">
                                                                                <div className="grid grid-cols-2 gap-4">
                                                                                    <div>
                                                                                        <h4 className="text-xs font-medium text-muted-foreground mb-2">Original Headline</h4>
                                                                                        <div className="p-3 bg-muted/50 border">
                                                                                            <p className="text-sm">{selectedVariant.new_headlines[currentHeadlineIndex].original}</p>
                                                                                            <span className="text-xs text-muted-foreground mt-1 block">
                                                                                                {selectedVariant.original_headlines[currentHeadlineIndex]?.type}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div>
                                                                                        <h4 className="text-xs font-medium text-muted-foreground mb-2">New Headline</h4>
                                                                                        <div className="p-3 bg-primary/5 border-primary/10 border">
                                                                                            <p className="text-sm">{selectedVariant.new_headlines[currentHeadlineIndex].text}</p>
                                                                                            <span className="text-xs text-muted-foreground mt-1 block">
                                                                                                {selectedVariant.new_headlines[currentHeadlineIndex].type}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="grid grid-cols-2 gap-4 pt-4">
                                                                                    <div className="space-y-3">
                                                                                        <div>
                                                                                            <h4 className="text-xs font-medium text-muted-foreground mb-2">Improvements</h4>
                                                                                            <ul className="space-y-2">
                                                                                                {selectedVariant.new_headlines[currentHeadlineIndex].improvements.map((improvement, i) => (
                                                                                                    <li key={i} className="text-sm flex gap-2 items-start">
                                                                                                        <div className="h-2 w-2 bg-primary mt-2 flex-shrink-0" />
                                                                                                        <span>{improvement}</span>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                        <div>
                                                                                            <h4 className="text-xs font-medium text-muted-foreground mb-2">Expected Impact</h4>
                                                                                            <ul className="space-y-2">
                                                                                                {selectedVariant.new_headlines[currentHeadlineIndex].expected_impact.map((impact, i) => (
                                                                                                    <li key={i} className="text-sm flex gap-2 items-start">
                                                                                                        <div className="h-2 w-2 bg-blue-500 mt-2 flex-shrink-0" />
                                                                                                        <span>{impact}</span>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="space-y-3">
                                                                                        <div>
                                                                                            <h4 className="text-xs font-medium text-muted-foreground mb-2">Target Audience</h4>
                                                                                            <ul className="space-y-2">
                                                                                                {selectedVariant.new_headlines[currentHeadlineIndex].target_audience.map((audience, i) => (
                                                                                                    <li key={i} className="text-sm flex gap-2 items-start">
                                                                                                        <div className="h-2 w-2 bg-green-500 mt-2 flex-shrink-0" />
                                                                                                        <span>{audience}</span>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                        <div>
                                                                                            <h4 className="text-xs font-medium text-muted-foreground mb-2">Pain Points Addressed</h4>
                                                                                            <ul className="space-y-2">
                                                                                                {selectedVariant.new_headlines[currentHeadlineIndex].pain_points_addressed.map((point, i) => (
                                                                                                    <li key={i} className="text-sm flex gap-2 items-start">
                                                                                                        <div className="h-2 w-2 bg-red-500 mt-2 flex-shrink-0" />
                                                                                                        <span>{point}</span>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </Card>
                                                                    </div>

                                                                    {/* Performance Metrics Section */}
                                                                    <div className="space-y-6">
                                                                        <div>
                                                                            <h3 className="text-sm font-medium mb-4">Performance Metrics</h3>
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                                {/* Success Likelihood */}
                                                                                <Card className="p-6 relative overflow-hidden border bg-muted/50 rounded-none">
                                                                                    <div className="relative z-10">
                                                                                        <div className="flex items-center justify-between mb-4">
                                                                                            <div className="space-y-1">
                                                                                                <h4 className="text-sm font-medium">Success Likelihood</h4>
                                                                                                <p className="text-xs text-muted-foreground">Predicted success rate</p>
                                                                                            </div>
                                                                                            <div className={cn(
                                                                                                "px-2.5 py-0.5 rounded-sm text-xs font-semibold",
                                                                                                selectedVariant.overall_success_likelihood.metric >= 75
                                                                                                    ? "bg-green-500/10 text-green-700"
                                                                                                    : selectedVariant.overall_success_likelihood.metric >= 50
                                                                                                        ? "bg-yellow-500/10 text-yellow-700"
                                                                                                        : "bg-red-500/10 text-red-700"
                                                                                            )}>
                                                                                                {selectedVariant.overall_success_likelihood.metric.toFixed(1)}%
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="space-y-2">
                                                                                            <div className="h-2 w-full rounded-none bg-muted overflow-hidden">
                                                                                                <div className={cn(
                                                                                                    "h-full transition-all",
                                                                                                    selectedVariant.overall_success_likelihood.metric >= 75
                                                                                                        ? "bg-green-500"
                                                                                                        : selectedVariant.overall_success_likelihood.metric >= 50
                                                                                                            ? "bg-yellow-500"
                                                                                                            : "bg-red-500"
                                                                                                )}
                                                                                                    style={{
                                                                                                        width: `${selectedVariant.overall_success_likelihood.metric}%`,
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                            <div className="text-sm text-muted-foreground">
                                                                                                <ReactMarkdown
                                                                                                    remarkPlugins={[remarkGfm]}
                                                                                                    className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-medium prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm prose-strong:font-medium prose-strong:text-primary prose-a:text-primary hover:prose-a:underline prose-code:text-muted-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-ul:my-2 prose-li:my-0 prose-p:my-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4"
                                                                                                >
                                                                                                    {selectedVariant.overall_success_likelihood.reason}
                                                                                                </ReactMarkdown>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </Card>

                                                                                {/* CTR */}
                                                                                <Card className="p-6 relative overflow-hidden border bg-muted/50 rounded-none">
                                                                                    <div className="relative z-10">
                                                                                        <div className="flex items-center justify-between mb-4">
                                                                                            <div className="space-y-1">
                                                                                                <h4 className="text-sm font-medium">Click-Through Rate</h4>
                                                                                                <p className="text-xs text-muted-foreground">Predicted engagement</p>
                                                                                            </div>
                                                                                            <div className={cn(
                                                                                                "px-2.5 py-0.5 rounded-sm text-xs font-semibold",
                                                                                                selectedVariant.predicted_ctr.metric >= 5
                                                                                                    ? "bg-green-500/10 text-green-700"
                                                                                                    : selectedVariant.predicted_ctr.metric >= 2
                                                                                                        ? "bg-yellow-500/10 text-yellow-700"
                                                                                                        : "bg-red-500/10 text-red-700"
                                                                                            )}>
                                                                                                {selectedVariant.predicted_ctr.metric.toFixed(2)}%
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="space-y-2">
                                                                                            <div className="h-2 w-full rounded-none bg-muted overflow-hidden">
                                                                                                <div className={cn(
                                                                                                    "h-full transition-all",
                                                                                                    selectedVariant.predicted_ctr.metric >= 5
                                                                                                        ? "bg-green-500"
                                                                                                        : selectedVariant.predicted_ctr.metric >= 2
                                                                                                            ? "bg-yellow-500"
                                                                                                            : "bg-red-500"
                                                                                                )}
                                                                                                    style={{
                                                                                                        width: `${selectedVariant.predicted_ctr.metric * 10}%`,
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                            <div className="text-sm text-muted-foreground">
                                                                                                <ReactMarkdown
                                                                                                    remarkPlugins={[remarkGfm]}
                                                                                                    className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-medium prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm prose-strong:font-medium prose-strong:text-primary prose-a:text-primary hover:prose-a:underline prose-code:text-muted-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-ul:my-2 prose-li:my-0 prose-p:my-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4"
                                                                                                >
                                                                                                    {selectedVariant.predicted_ctr.reason}
                                                                                                </ReactMarkdown>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </Card>

                                                                                {/* Impressions */}
                                                                                <Card className="p-6 relative overflow-hidden border bg-muted/50 rounded-none">
                                                                                    <div className="relative z-10">
                                                                                        <div className="flex items-center justify-between mb-4">
                                                                                            <div className="space-y-1">
                                                                                                <h4 className="text-sm font-medium">Impressions</h4>
                                                                                                <p className="text-xs text-muted-foreground">Predicted reach</p>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <Eye className="h-4 w-4 text-blue-500" />
                                                                                                <span className="text-sm font-semibold text-blue-700">
                                                                                                    {formatCompactNumber(selectedVariant.predicted_impressions.metric)}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="text-sm text-muted-foreground">
                                                                                            <ReactMarkdown
                                                                                                remarkPlugins={[remarkGfm]}
                                                                                                className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-medium prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm prose-strong:font-medium prose-strong:text-primary prose-a:text-primary hover:prose-a:underline prose-code:text-muted-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-ul:my-2 prose-li:my-0 prose-p:my-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4"
                                                                                            >
                                                                                                {selectedVariant.predicted_impressions.reason}
                                                                                            </ReactMarkdown>
                                                                                        </div>
                                                                                    </div>
                                                                                </Card>

                                                                                {/* Clicks */}
                                                                                <Card className="p-6 relative overflow-hidden border bg-muted/50 rounded-none">
                                                                                    <div className="relative z-10">
                                                                                        <div className="flex items-center justify-between mb-4">
                                                                                            <div className="space-y-1">
                                                                                                <h4 className="text-sm font-medium">Clicks</h4>
                                                                                                <p className="text-xs text-muted-foreground">Predicted interactions</p>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <MousePointerClick className="h-4 w-4 text-violet-500" />
                                                                                                <span className="text-sm font-semibold text-violet-700">
                                                                                                    {formatCompactNumber(selectedVariant.predicted_clicks.metric)}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="text-sm text-muted-foreground">
                                                                                            <ReactMarkdown
                                                                                                remarkPlugins={[remarkGfm]}
                                                                                                className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-medium prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm prose-strong:font-medium prose-strong:text-primary prose-a:text-primary hover:prose-a:underline prose-code:text-muted-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-ul:my-2 prose-li:my-0 prose-p:my-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4"
                                                                                            >
                                                                                                {selectedVariant.predicted_clicks.reason}
                                                                                            </ReactMarkdown>
                                                                                        </div>
                                                                                    </div>
                                                                                </Card>

                                                                                {/* Conversions */}
                                                                                <Card className="p-6 relative overflow-hidden col-span-2 border bg-muted/50 rounded-none">
                                                                                    <div className="relative z-10">
                                                                                        <div className="flex items-center justify-between mb-4">
                                                                                            <div className="space-y-1">
                                                                                                <h4 className="text-sm font-medium">Conversions</h4>
                                                                                                <p className="text-xs text-muted-foreground">Predicted successful outcomes</p>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <Target className="h-4 w-4 text-green-500" />
                                                                                                <span className="text-sm font-semibold text-green-700">
                                                                                                    {formatCompactNumber(selectedVariant.predicted_conversions.metric)}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="text-sm text-muted-foreground">
                                                                                            <ReactMarkdown
                                                                                                remarkPlugins={[remarkGfm]}
                                                                                                className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-medium prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm prose-strong:font-medium prose-strong:text-primary prose-a:text-primary hover:prose-a:underline prose-code:text-muted-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-ul:my-2 prose-li:my-0 prose-p:my-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4"
                                                                                            >
                                                                                                {selectedVariant.predicted_conversions.reason}
                                                                                            </ReactMarkdown>
                                                                                        </div>
                                                                                    </div>
                                                                                </Card>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Rules Used Section */}
                                                                    <div className="space-y-4">
                                                                        <div className="sticky top-0 bg-background pt-4 pb-2 -mx-6 px-6 border-b z-10">
                                                                            <h3 className="text-sm font-medium">Rules Applied</h3>
                                                                        </div>
                                                                        <div className="grid grid-cols-4 gap-3">
                                                                            {selectedVariant.rules_used.map((rule, index) => (
                                                                                <Card key={index} className="p-3 border bg-muted/50 rounded-none">
                                                                                    <div className="space-y-2">
                                                                                        <div className="flex items-center justify-between gap-2">
                                                                                            <h4 className="text-sm font-medium">{rule.name}</h4>
                                                                                            <span className="px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary text-xs">
                                                                                                {rule.type}
                                                                                            </span>
                                                                                        </div>
                                                                                        <p className="text-xs text-muted-foreground">{rule.description}</p>
                                                                                    </div>
                                                                                </Card>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="px-6 py-4 border-t bg-background mt-auto">
                                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                            <span>Created: {selectedVariant && new Date(selectedVariant.created_at).toLocaleString()}</span>
                                                            <span>Last Updated: {selectedVariant && new Date(selectedVariant.updated_at).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    )}

                                <Button onClick={() => setIsRuleSelectionOpen(true)} variant="outline" className="w-full border-dashed gap-1 rounded-none" size="sm">
                                    <Play className="h-4 w-4" />
                                    <span>Run Automation</span>
                                </Button>
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
    )
}