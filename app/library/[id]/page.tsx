"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { type Database } from "@/lib/types/schema";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";

type TargetAudienceSegment = {
    name: string;
    characteristics: string[];
    pain_points: string[];
    preferences: string[];
};

type KeyFeature = {
    name: string;
    importance_score: number;
    mentioned_benefits: string[];
};

type Keyword = {
    keyword: string;
    intent_reflected: string;
    likelihood_score: number;
};

type HeadlineAnalysis = {
    improved: string;
    original: string;
    improvements: string[];
    expected_impact: string[];
    target_audience: string[];
    pain_point_addressed: string[];
};

type MarketResearch = Database['public']['Tables']['market_research_v2']['Row'] & {
    target_audience: TargetAudienceSegment[];
    key_features: KeyFeature[];
    competitive_advantages: string[];
    pain_points: string[];
    keywords: Keyword[];
    new_headlines: HeadlineAnalysis[];
    citations: string[];
    perplexity_insights: string;
    intent_summary: string;
    buying_stage: string;
};

type AdRecord = {
    id: string;
    image_url: string;
    image_description: string;
    name?: string;
    features: {
        keyword: string;
        confidence_score: number;
        category: string;
        location: string;
        visual_attributes?: {
            attribute: string;
            value: string;
        }[];
    }[];
    sentiment_analysis: {
        tone: string;
        confidence: number;
    };
    created_at: string;
    market_research?: MarketResearch;
};

type AdOutput = Database['public']['Tables']['ad_structured_output']['Row'];
type Feature = Database['public']['Tables']['features']['Row'];
type VisualAttribute = Database['public']['Tables']['visual_attributes']['Row'];
type FeatureWithVisualAttributes = Feature & { visual_attributes: VisualAttribute[] };
type SentimentAnalysis = Database['public']['Tables']['sentiment_analysis']['Row'];

// Add type for enhanced metrics
type EnhancedMetrics = {
    ad_id: string;
    campaign_id: string | null;
    channel: string;
    clicks: number;
    impressions: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversion_rate: number;
    conversions: number;
    cost: number;
    roas: number;
    date: string;
    viewability_rate: number;
    viewable_impressions: number;
};

const LoadingSkeleton = () => (
    <div className="min-h-screen bg-background">
        <div className="px-4 py-4">
            {/* Header Skeleton */}
            <div className="mx-auto mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-48" />
                    </div>
                    <Skeleton className="h-4 w-32" />
                </div>
            </div>

            {/* Main Content Skeleton */}
            <div className="mx-auto">
                <div className={`grid grid-cols-1 ${"lg:grid-cols-[400px,1fr]"
                    } gap-6`}>
                    {/* Left Column */}
                    <div className="space-y-4">
                        <Skeleton className="aspect-video w-full" />

                        {/* Description Skeleton */}
                        <div className="border bg-card">
                            <div className="px-4 py-2 border-b">
                                <Skeleton className="h-4 w-24" />
                            </div>
                            <div className="p-4 space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-4/5" />
                            </div>
                        </div>

                        {/* Sentiment Analysis Skeleton */}
                        <div className="border bg-card">
                            <div className="px-4 py-2 border-b">
                                <Skeleton className="h-4 w-32" />
                            </div>
                            <div className="p-4">
                                <div className="flex items-center gap-4">
                                    <Skeleton className="h-6 w-24" />
                                    <Skeleton className="h-2 flex-1" />
                                </div>
                            </div>
                        </div>

                        {/* Features Skeleton */}
                        <div className="border bg-card">
                            <div className="px-4 py-2 border-b">
                                <Skeleton className="h-4 w-24" />
                            </div>
                            <div className="p-4 space-y-3">
                                {Array(3).fill(0).map((_, i) => (
                                    <div key={i} className="space-y-2">
                                        <div className="flex justify-between">
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-4 w-16" />
                                        </div>
                                        <Skeleton className="h-4 w-full" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4">
                        <div className="border bg-card">
                            <div className="px-4 py-2 border-b">
                                <Skeleton className="h-4 w-32" />
                            </div>
                            <div className="p-4">
                                <Skeleton className="h-[400px] w-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

export default function AdDetail({
    params,
    searchParams
}: {
    params: { id: string };
    searchParams: { image_url?: string }
}) {
    const router = useRouter();
    const [record, setRecord] = useState<AdRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [metrics, setMetrics] = useState<EnhancedMetrics[]>([]);

    useEffect(() => {
        fetchRecord();
    }, [params.id]);

    const fetchRecord = async () => {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            console.error("Error getting user:", userError);
            setLoading(false);
            return;
        }

        // Fetch all data in parallel
        const [
            { data: adOutput, error: adError },
            { data: features },
            { data: sentiment },
            { data: marketResearch },
            { data: enhancedMetrics }
        ] = await Promise.all([
            // Ad output
            supabase
                .from('ad_structured_output')
                .select()
                .eq('id', params.id)
                .eq('user', user.id)
                .single<AdOutput>(),

            // Features
            supabase
                .from('features')
                .select(`
                    *,
                    visual_attributes (*)
                `)
                .eq('ad_output_id', params.id)
                .eq('user', user.id)
                .select<'features', FeatureWithVisualAttributes>(),

            // Sentiment analysis
            supabase
                .from('sentiment_analysis')
                .select('*')
                .eq('ad_output_id', params.id)
                .eq('user', user.id)
                .single<SentimentAnalysis>(),

            // Market research - get single record
            supabase
                .from('market_research_v2')
                .select('*')
                .eq('image_url', searchParams.image_url)
                .single<Database['public']['Tables']['market_research_v2']['Row']>(),

            // Enhanced Metrics
            supabase
                .from('enhanced_ad_metrics')
                .select('*')
                .eq('ad_id', params.id)
                .order('date', { ascending: false })
        ]);

        if (adError || !adOutput) {
            console.error("Error fetching ad output:", adError);
            setLoading(false);
            return;
        }

        // Set enhanced metrics if available
        if (enhancedMetrics) {
            setMetrics(enhancedMetrics as EnhancedMetrics[]);
        }

        const record = {
            id: adOutput.id,
            name: adOutput.name ?? (
                features?.[0]?.keyword && sentiment?.tone
                    ? `Untitled ('${features[0].keyword}' + '${sentiment.tone}')`
                    : "Untitled"
            ),
            image_url: adOutput.image_url,
            image_description: adOutput.image_description,
            created_at: new Date().toISOString(),
            features: (features || []).map(feature => ({
                keyword: feature.keyword,
                confidence_score: feature.confidence_score,
                category: feature.category,
                location: feature.location,
                visual_attributes: feature.visual_attributes
            })),
            sentiment_analysis: sentiment || { tone: '', confidence: 0 },
            market_research: marketResearch || undefined
        };

        setRecord(record as AdRecord);
        setLoading(false);
    };

    // Helper function to format numbers
    const formatNumber = (num: number): string => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    };

    // Helper function to format currency
    const formatCurrency = (amount: number): string => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    };

    if (loading) {
        return <LoadingSkeleton />;
    }

    if (!record) {
        return <div className="min-h-screen p-8 bg-background">Record not found</div>;
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="px-4 py-4">
                {/* Header */}
                <div className="mx-auto mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => router.back()}
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <h1 className="text-2xl font-semibold">{record.name ?? 'Untitled'}</h1>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Created {new Date(record.created_at).toLocaleString()}
                        </p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="mx-auto">
                    <div className={`grid grid-cols-1 ${record.market_research ? "lg:grid-cols-[400px,1fr]" : "lg:grid-cols-2"} gap-6`}>
                        {/* Left Column */}
                        <div className="space-y-4">
                            {/* Image */}
                            <div className="relative aspect-video w-full bg-accent/50">
                                <Image
                                    src={record.image_url}
                                    alt="Analysis image"
                                    layout="fill"
                                    objectFit="contain"
                                    className="bg-accent/50"
                                />
                            </div>

                            {/* Description */}
                            <div className="bg-card border">
                                <div className="px-4 py-2 border-b bg-muted/50">
                                    <h2 className="font-medium">Description</h2>
                                </div>
                                <div className="p-4">
                                    <div className="relative">
                                        <p
                                            className={`text-muted-foreground ${record.market_research ? 'text-sm' : ''} ${expanded ? '' : 'line-clamp-4'
                                                }`}
                                        >
                                            {record.image_description}
                                        </p>
                                        <button
                                            onClick={() => setExpanded(!expanded)}
                                            className="text-xs text-primary hover:text-primary/80 mt-1"
                                        >
                                            {expanded ? 'Show less' : 'Show more'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Sentiment Analysis and Features - Only show if market research exists */}
                            {record.market_research && (
                                <>
                                    {/* Sentiment Analysis */}
                                    <div className="bg-card border">
                                        <div className="px-4 py-2 border-b bg-muted/50">
                                            <h2 className="font-medium">Sentiment Analysis</h2>
                                        </div>
                                        <div className="p-4">
                                            <div className="flex items-center gap-4">
                                                <span className="text-base capitalize">{record.sentiment_analysis.tone}</span>
                                                <div className="flex-1">
                                                    <Progress
                                                        value={record.sentiment_analysis.confidence * 100}
                                                        className="h-2"
                                                    />
                                                </div>
                                                <span className="text-base text-muted-foreground">
                                                    {(record.sentiment_analysis.confidence * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Features */}
                                    <div className="bg-card border">
                                        <div className="px-4 py-2 border-b bg-muted/50">
                                            <h2 className="font-medium">Visual Features</h2>
                                        </div>
                                        <div className="p-4">
                                            <div className="space-y-3">
                                                {record.features.map((feature, index) => (
                                                    <div
                                                        key={index}
                                                        className="bg-muted/50 border p-3 space-y-2"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-medium">{feature.keyword}</span>
                                                                <span className="text-sm text-muted-foreground">
                                                                    ({feature.category})
                                                                </span>
                                                            </div>
                                                            <span className="text-sm text-muted-foreground">
                                                                {(feature.confidence_score * 100).toFixed(0)}%
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            <p>Location: {feature.location}</p>
                                                            {feature.visual_attributes && feature.visual_attributes.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-2 pl-2 border-l-2 border-muted">
                                                                    {feature.visual_attributes.map((attr) => (
                                                                        <span
                                                                            key={attr.attribute}
                                                                            className="inline-flex items-center text-xs bg-muted/40 px-1.5 py-0.5"
                                                                        >
                                                                            <span className="text-muted-foreground">{attr.attribute}:</span>
                                                                            <span className="ml-1 font-medium">{attr.value}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                            {/* Enhanced Metrics Section - Moved here and made more condensed */}
                            {metrics.length > 0 && (
                                <div className="bg-card border">
                                    <div className="px-4 py-2 border-b bg-muted/50 flex items-center justify-between">
                                        <h2 className="font-medium">Performance Metrics</h2>
                                        <span className="text-xs text-white bg-green-500/20 px-2 py-0.5 rounded-md">Demo Purposes Only</span>
                                    </div>
                                    <div className="p-3">
                                        <div className="flex justify-between text-xs text-muted-foreground mb-2">
                                            <span>Campaign: <span className="font-medium text-foreground">{metrics[0].campaign_id || 'None'}</span></span>
                                            <span>Channel: <span className="font-medium text-foreground capitalize">{metrics[0].channel}</span></span>
                                        </div>

                                        <div className="grid grid-cols-4 gap-2">
                                            {/* Main metrics in a compact grid */}
                                            <div className="bg-muted/30 p-2 rounded-md border text-center">
                                                <div className="text-xs text-muted-foreground">Impressions</div>
                                                <div className="text-sm font-medium">{formatNumber(metrics[0].impressions)}</div>
                                            </div>
                                            <div className="bg-muted/30 p-2 rounded-md border text-center">
                                                <div className="text-xs text-muted-foreground">Clicks</div>
                                                <div className="text-sm font-medium">{formatNumber(metrics[0].clicks)}</div>
                                            </div>
                                            <div className="bg-muted/30 p-2 rounded-md border text-center">
                                                <div className="text-xs text-muted-foreground">Conv.</div>
                                                <div className="text-sm font-medium">{metrics[0].conversions}</div>
                                            </div>
                                            <div className="bg-muted/30 p-2 rounded-md border text-center">
                                                <div className="text-xs text-muted-foreground">Cost</div>
                                                <div className="text-sm font-medium">{formatCurrency(metrics[0].cost)}</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-4 gap-2 mt-2">
                                            {/* Secondary metrics */}
                                            <div className="flex flex-col p-2 text-center">
                                                <span className="text-xs text-muted-foreground">CTR</span>
                                                <span className="text-xs font-medium">{(metrics[0].ctr * 100).toFixed(2)}%</span>
                                            </div>
                                            <div className="flex flex-col p-2 text-center">
                                                <span className="text-xs text-muted-foreground">CPC</span>
                                                <span className="text-xs font-medium">{formatCurrency(metrics[0].cpc)}</span>
                                            </div>
                                            <div className="flex flex-col p-2 text-center">
                                                <span className="text-xs text-muted-foreground">Conv. Rate</span>
                                                <span className="text-xs font-medium">{(metrics[0].conversion_rate * 100).toFixed(2)}%</span>
                                            </div>
                                            <div className="flex flex-col p-2 text-center">
                                                <span className="text-xs text-muted-foreground">ROAS</span>
                                                <span className="text-xs font-medium">{metrics[0].roas.toFixed(2)}x</span>
                                            </div>
                                        </div>

                                        <div className="mt-2 flex justify-end">
                                            <span className="text-xs text-muted-foreground">Updated: {new Date(metrics[0].date).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {record.market_research ? (
                                <>
                                    {/* Existing Market Research Content */}
                                    <div className="bg-card border h-[calc(100vh-8rem)]">
                                        <div className="px-4 py-2 border-b bg-muted/50">
                                            <h2 className="font-medium">Market Research & Optimization</h2>
                                        </div>
                                        <div className="h-[calc(100%-45px)]">
                                            <Tabs defaultValue="headlines" className="h-full flex flex-col">
                                                <div className="px-4 pt-4">
                                                    <TabsList className="mb-4 w-full justify-start h-auto gap-2 bg-transparent p-0 flex-wrap shrink-0">
                                                        <TabsTrigger value="headlines" className="data-[state=active]:bg-primary/10 px-3 py-1.5 text-xs">
                                                            Headlines & Keywords
                                                        </TabsTrigger>
                                                        <TabsTrigger value="core" className="data-[state=active]:bg-primary/10 px-3 py-1.5 text-xs">
                                                            Core Information
                                                        </TabsTrigger>
                                                        <TabsTrigger value="deep" className="data-[state=active]:bg-primary/10 px-3 py-1.5 text-xs">
                                                            Deep Research
                                                        </TabsTrigger>
                                                    </TabsList>
                                                </div>

                                                <TabsContent value="core" className="flex-1 space-y-0 mt-0 overflow-y-auto px-0">
                                                    {/* Top Section with Intent and Stage */}
                                                    <div className="grid grid-cols-[1fr,auto] gap-6">
                                                        {/* Intent Summary */}
                                                        <div className="border bg-card p-4">
                                                            <h3 className="text-sm font-medium mb-2">Intent Summary</h3>
                                                            <p className="text-sm text-muted-foreground">
                                                                {record.market_research?.intent_summary}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Buying Stage */}
                                                    <div className="border bg-card p-4">
                                                        <h3 className="text-sm font-medium mb-3">Buying Stage(s)</h3>
                                                        <div className="flex flex-wrap gap-2">
                                                            <span className="border bg-muted/50 px-2.5 py-1 text-xs">
                                                                {record.market_research?.buying_stage}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Competitive Advantages */}
                                                    <div className="border bg-card p-4">
                                                        <h3 className="text-sm font-medium mb-3">Competitive Advantages</h3>
                                                        <div className="flex flex-wrap gap-2">
                                                            {record.market_research?.competitive_advantages.map((advantage, i) => (
                                                                <span key={i} className="border bg-muted/50 px-2.5 py-1 text-xs">
                                                                    {advantage}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Target Audience Segments */}
                                                    <div className="border bg-card p-4 mb-8">
                                                        <h3 className="text-sm font-medium mb-4">Target Audience Segments</h3>
                                                        <div className="space-y-6">
                                                            {record.market_research?.target_audience.map((segment, index) => (
                                                                <div key={index} className="border bg-muted/50 p-4">
                                                                    <div className="flex items-center gap-2 mb-4">
                                                                        <h4 className="text-sm font-medium">{segment.name}</h4>
                                                                        <span className="h-1 w-1 rounded-full bg-muted-foreground/25" />
                                                                        <span className="text-xs text-muted-foreground">Audience Segment {index + 1}</span>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        {/* Left Column */}
                                                                        <div className="space-y-4">
                                                                            {/* Characteristics */}
                                                                            <div>
                                                                                <h5 className="text-xs font-medium text-muted-foreground mb-2">Characteristics</h5>
                                                                                <div className="space-y-2">
                                                                                    {segment.characteristics.map((char, i) => (
                                                                                        <div key={i} className="flex items-start gap-2 text-sm">
                                                                                            <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-primary" />
                                                                                            <span className="text-muted-foreground">{char}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>

                                                                            {/* Preferences */}
                                                                            <div>
                                                                                <h5 className="text-xs font-medium text-muted-foreground mb-2">Preferences</h5>
                                                                                <div className="space-y-2">
                                                                                    {segment.preferences.map((pref, i) => (
                                                                                        <div key={i} className="flex items-start gap-2 text-sm">
                                                                                            <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-blue-500" />
                                                                                            <span className="text-muted-foreground">{pref}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Right Column */}
                                                                        <div>
                                                                            <h5 className="text-xs font-medium text-muted-foreground mb-2">Pain Points</h5>
                                                                            <div className="space-y-2">
                                                                                {segment.pain_points.map((point, i) => (
                                                                                    <div key={i} className="flex items-start gap-2 text-sm">
                                                                                        <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-destructive" />
                                                                                        <span className="text-muted-foreground">{point}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Key Features */}
                                                    <div className="border bg-card p-4">
                                                        <h4 className="text-sm font-medium mb-3">Product Priorities</h4>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {record.market_research?.key_features.map((feature, i) => (
                                                                <div key={i} className="border bg-muted/50 p-3">
                                                                    <div className="flex items-center justify-between gap-3 mb-2">
                                                                        <span className="text-sm font-medium">{feature.name}</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <Progress
                                                                                value={feature.importance_score * 100}
                                                                                className="w-16 h-1"
                                                                            />
                                                                            <span className="text-xs text-muted-foreground">
                                                                                {(feature.importance_score * 100).toFixed(0)}%
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        {feature.mentioned_benefits.map((benefit, j) => (
                                                                            <p key={j} className="text-xs text-muted-foreground pl-3 border-l">
                                                                                {benefit}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </TabsContent>

                                                <TabsContent value="headlines" className="flex-1 mt-0 overflow-y-auto px-4">
                                                    <div className="space-y-6">
                                                        {/* Keywords */}
                                                        {record.market_research.keywords && record.market_research.keywords.length > 0 && (
                                                            <div>
                                                                <h3 className="text-sm font-medium mb-3">Keywords</h3>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {record.market_research.keywords.map((keywordObj, i) => (
                                                                        <div
                                                                            key={i}
                                                                            className="flex items-center gap-2 text-xs bg-muted/50 px-2.5 py-1.5 border"
                                                                        >
                                                                            <span className="font-medium">{keywordObj.keyword}</span>
                                                                            <span className="text-muted-foreground">
                                                                                ({(keywordObj.likelihood_score * 100).toFixed(0)}%)
                                                                            </span>
                                                                            <span className="text-xs text-muted-foreground/75 border-l pl-2">
                                                                                {keywordObj.intent_reflected}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Headlines Analysis */}
                                                        {record.market_research.new_headlines?.length > 0 && (
                                                            <div className="space-y-4">
                                                                <h3 className="text-sm font-medium">Headlines Analysis</h3>
                                                                <div className="space-y-6">
                                                                    {record.market_research.new_headlines.map((headline, i) => (
                                                                        <div
                                                                            key={i}
                                                                            className="border bg-muted/50 p-4 space-y-4"
                                                                        >
                                                                            {/* Original vs Improved */}
                                                                            <div className="grid grid-cols-1 gap-4">
                                                                                <div className="space-y-2">
                                                                                    <span className="text-xs font-medium text-muted-foreground">Original</span>
                                                                                    <p className="text-sm font-medium bg-muted/30 p-2 border">
                                                                                        {headline.original}
                                                                                    </p>
                                                                                </div>
                                                                                {/* <div className="space-y-2">
                                                                                    <span className="text-xs font-medium text-muted-foreground">Improved</span>
                                                                                    <p className="text-sm font-medium bg-primary/5 p-2 border border-primary/20">
                                                                                        {headline.improved}
                                                                                    </p>
                                                                                </div> */}
                                                                            </div>

                                                                            {/* Improvements */}
                                                                            {/* <div className="space-y-2">
                                                                                <span className="text-xs font-medium text-muted-foreground">Improvements</span>
                                                                                <div className="space-y-1">
                                                                                    {headline.improvements.map((improvement, j) => (
                                                                                        <div key={j} className="flex items-start gap-2 text-sm">
                                                                                            <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-primary" />
                                                                                            <span className="text-muted-foreground">{improvement}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div> */}

                                                                            {/* Expected Impact */}
                                                                            {/* <div className="space-y-2">
                                                                                <span className="text-xs font-medium text-muted-foreground">Expected Impact</span>
                                                                                <div className="space-y-1">
                                                                                    {headline.expected_impact.map((impact, j) => (
                                                                                        <div key={j} className="flex items-start gap-2 text-sm">
                                                                                            <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-blue-500" />
                                                                                            <span className="text-muted-foreground">{impact}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div> */}

                                                                            {/* Target Audience & Pain Points */}
                                                                            <div className="grid grid-cols-2 gap-4">
                                                                                <div className="space-y-2">
                                                                                    <span className="text-xs font-medium text-muted-foreground">Target Audience</span>
                                                                                    <div className="flex flex-wrap gap-1.5">
                                                                                        {headline.target_audience.map((audience, j) => (
                                                                                            <span
                                                                                                key={j}
                                                                                                className="text-xs bg-muted/30 px-2 py-1 border"
                                                                                            >
                                                                                                {audience}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="space-y-2">
                                                                                    <span className="text-xs font-medium text-muted-foreground">Pain Points Addressed</span>
                                                                                    <div className="space-y-1">
                                                                                        {headline.pain_point_addressed.map((point, j) => (
                                                                                            <div key={j} className="flex items-start gap-2 text-xs">
                                                                                                <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-destructive" />
                                                                                                <span className="text-muted-foreground">{point}</span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TabsContent>

                                                <TabsContent value="deep" className="flex-1 mt-0 overflow-hidden">
                                                    <div className="border bg-card h-full flex flex-col">
                                                        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-sm">
                                                                    Tree-based traversal of 100+ sources.
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Sources Row */}
                                                        <div className="border-b flex-shrink-0">
                                                            <div className="p-4">
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <h4 className="text-xs font-medium text-muted-foreground">Most relevant sources</h4>
                                                                    <span className="text-xs text-muted-foreground/50">{record.market_research?.citations.length}</span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {record.market_research?.citations.map((citation, i) => {
                                                                        const urlMatch = citation.match(/https?:\/\/([^\/]+)/);
                                                                        const domain = urlMatch ? urlMatch[1] : '';
                                                                        const nameMatch = citation.match(/^(.*?)\s*-\s*http/);
                                                                        const name = nameMatch ? nameMatch[1] : domain;

                                                                        return (
                                                                            <div
                                                                                key={i}
                                                                                className="flex items-center gap-2 shrink-0 border bg-muted/50 px-3 py-1.5 rounded-sm"
                                                                            >
                                                                                <div className="relative h-4 w-4 flex-none">
                                                                                    <img
                                                                                        src={`https://${domain}/favicon.ico`}
                                                                                        alt={`${name} Icon`}
                                                                                        className="rounded-full w-4 h-4"
                                                                                        onError={(e) => {
                                                                                            e.currentTarget.onerror = null;
                                                                                            e.currentTarget.src = '/placeholder-favicon.png';
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                                                    {name}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Markdown Content - Make this section scrollable */}
                                                        <div className="flex-1 overflow-y-auto">
                                                            <div className="p-4">
                                                                <ReactMarkdown
                                                                    className="text-sm text-muted-foreground [&>h2]:text-base [&>h2]:font-medium [&>h2]:mt-6 [&>h2]:mb-3 [&>h2:first-child]:mt-0 [&>h3]:text-sm [&>h3]:font-medium [&>h3]:mt-4 [&>h3]:mb-2 [&>ul]:mt-2 [&>ul]:space-y-1.5 [&>ul>li]:ml-4 [&>ul>li]:list-disc [&>ul>li>strong]:font-medium [&>p]:mt-2 [&>p]:leading-relaxed"
                                                                >
                                                                    {record.market_research?.perplexity_insights || ''}
                                                                </ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TabsContent>
                                            </Tabs>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                // Sentiment Analysis and Features - Only show if no market research
                                <>
                                    {/* Sentiment Analysis */}
                                    <div className="bg-card border">
                                        <div className="px-4 py-2 border-b bg-muted/50">
                                            <h2 className="font-medium">Sentiment Analysis</h2>
                                        </div>
                                        <div className="p-4">
                                            <div className="flex items-center gap-4">
                                                <span className="text-base capitalize">{record.sentiment_analysis.tone}</span>
                                                <div className="flex-1">
                                                    <Progress
                                                        value={record.sentiment_analysis.confidence * 100}
                                                        className="h-2"
                                                    />
                                                </div>
                                                <span className="text-base text-muted-foreground">
                                                    {(record.sentiment_analysis.confidence * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Features */}
                                    <div className="bg-card border">
                                        <div className="px-4 py-2 border-b bg-muted/50">
                                            <h2 className="font-medium">Visual Features</h2>
                                        </div>
                                        <div className="p-4">
                                            <div className="space-y-3">
                                                {record.features.map((feature, index) => (
                                                    <div
                                                        key={index}
                                                        className="bg-muted/50 border p-3 space-y-2"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-medium">{feature.keyword}</span>
                                                                <span className="text-sm text-muted-foreground">
                                                                    ({feature.category})
                                                                </span>
                                                            </div>
                                                            <span className="text-sm text-muted-foreground">
                                                                {(feature.confidence_score * 100).toFixed(0)}%
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            <p>Location: {feature.location}</p>
                                                            {feature.visual_attributes && feature.visual_attributes.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-2 pl-2 border-l-2 border-muted">
                                                                    {feature.visual_attributes.map((attr) => (
                                                                        <span
                                                                            key={attr.attribute}
                                                                            className="inline-flex items-center text-xs bg-muted/40 px-1.5 py-0.5"
                                                                        >
                                                                            <span className="text-muted-foreground">{attr.attribute}:</span>
                                                                            <span className="ml-1 font-medium">{attr.value}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 