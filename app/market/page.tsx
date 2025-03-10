"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, MaximizeIcon, Medal, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";
import _ from "lodash";
import { motion } from "framer-motion";

// Helper function to process recommendations
const processRecommendation = (recommendation: string): React.ReactNode => {
    // Strip number prefixes like "1. ", "2. ", etc.
    const strippedText = recommendation.replace(/^\d+\.\s+/, '');

    // Process bold text (text between ** **)
    if (!strippedText.includes('**')) return strippedText;

    const parts = strippedText.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            // Extract text between ** and render as bold
            const boldText = part.slice(2, -2);
            return <strong key={i}>{boldText}</strong>;
        }
        return part;
    });
};

type MarketPositioning = {
    strength: number;
    opportunity: string;
    competitors: string[];
    differentiators: string[];
};

type MarketOverview = {
    executive_summary: {
        key_findings: string[];
        strategic_recommendations: string[];
    };
    market_summary: {
        target_audiences: Array<{
            segment: string;
            details: {
                characteristics: string[];
                preferences: string[];
            };
            pain_points: string[];
            buying_stage: string;
            citations: string[];
        }>;
        competitive_landscape: {
            advantages: Record<string, string[]>;
            feature_comparison: Record<string, {
                importance_score: number;
                benefits: string[];
            }>;
            market_positioning: Record<string, MarketPositioning>;
        };
        key_features: Record<string, {
            benefits: string[];
            average_importance: number;
            frequency: number;
        }>;
        buying_stages: string[];
    };
    market_analysis: {
        trends: Record<string, string>;
        strategic_recommendations: string[];
    };
    keyword_insights: {
        analysis: Array<{
            keyword: string;
            intent: string;
            likelihood: number;
            citations: string[];
        }>;
    };
    brand_insights: Array<{
        insight: string;
        source_urls: string[];
        details: {
            brand: string;
            segments: string[];
            features: string[];
        };
    }>;
    market_insights: Array<{
        insight: string;
        source_urls: string[];
        details: {
            key_segments: string[];
            price_ranges: string[];
        };
    }>;
    metadata: {
        generated_at: string;
        user_id: string;
        filters_applied: Record<string, {
            segment?: string;
            stage?: string;
            timeframe?: string;
            competitors?: string[];
        }>;
        data_sources: string[];
    };
};

export default function Market() {
    const [marketData, setMarketData] = useState<MarketOverview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState("intelligence");

    useEffect(() => {
        const fetchMarketOverview = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("No user found");

                const { data, error } = await supabase
                    .from('markets_overview')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (error) throw error;
                setMarketData(data.insights as MarketOverview);
            } catch (error) {
                console.error("Error fetching market overview:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMarketOverview();
    }, []);

    if (isLoading) {
        return (
            <div className="bg-background overflow-hidden overflow-y-clip overscroll-y-none">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-2">
                    {/* Header with greeting */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="text-lg font-light tracking-wide text-muted-foreground">
                            <div className="h-6 w-48 bg-muted/50 rounded animate-pulse" />
                        </div>

                        {/* Tab skeleton */}
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2 px-2 py-1 rounded-sm bg-muted/50 animate-pulse">
                                <div className="h-4 w-4 bg-muted rounded" />
                                <div className="h-4 w-32 bg-muted rounded" />
                            </div>
                            <div className="flex items-center gap-2 px-2 py-1 rounded-sm">
                                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
                                <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                                <div className="h-5 w-6 bg-muted rounded-full animate-pulse" />
                            </div>
                            <div className="flex items-center gap-2 px-2 py-1 rounded-sm">
                                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
                                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                                <div className="h-5 w-6 bg-muted rounded-full animate-pulse" />
                            </div>
                            <div className="flex items-center gap-2 px-2 py-1 rounded-sm">
                                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
                                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                            </div>
                        </div>
                    </div>

                    {/* Main content skeleton */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Recommendations card skeleton */}
                        <div className="border bg-card rounded-none h-[700px]">
                            <div className="border-b bg-muted/50 px-4 py-2">
                                <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                            </div>
                            <div className="p-6 space-y-4">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="flex gap-2 items-start border bg-muted/50 p-4">
                                        <div className="h-2 w-2 bg-muted rounded mt-2 flex-shrink-0 animate-pulse" />
                                        <div className="space-y-2 w-full">
                                            <div className="h-4 bg-muted rounded animate-pulse" />
                                            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Market trends skeleton */}
                        <div className="space-y-6">
                            {/* Trends section */}
                            <div className="border bg-muted/50 p-4">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-5 px-2 bg-[#4EBE96]/20 rounded-sm animate-pulse" />
                                        <div className="h-5 w-36 bg-black/80 rounded-sm animate-pulse" />
                                    </div>
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 bg-muted rounded-full animate-pulse" />
                                                <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                                            </div>
                                            <div className="ml-3.5 h-4 w-full bg-muted rounded animate-pulse" />
                                        </div>
                                    ))}
                                    <div className="flex justify-end">
                                        <div className="h-8 w-24 bg-muted rounded animate-pulse" />
                                    </div>
                                </div>
                            </div>

                            {/* Brand insights skeleton */}
                            {[...Array(2)].map((_, i) => (
                                <div key={i} className="border bg-muted/50 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                                            <div className="flex">
                                                <div className="w-4 h-4 rounded-full bg-muted animate-pulse" />
                                                <div className="w-4 h-4 rounded-full bg-muted ml-[-6px] animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="h-5 w-16 bg-muted rounded-sm animate-pulse" />
                                            <div className="h-5 w-16 bg-muted rounded-sm animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-4 bg-muted rounded animate-pulse" />
                                        <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                                    </div>
                                    <div className="mt-3 flex gap-2">
                                        <div className="h-5 w-20 bg-muted rounded-sm animate-pulse" />
                                        <div className="h-5 w-20 bg-muted rounded-sm animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!marketData) {
        return (
            <div className="min-h-screen bg-background p-6">
                <h1 className="text-2xl font-semibold mb-4">No market data available</h1>
                <p className="text-muted-foreground">Please generate market insights first.</p>
            </div>
        );
    }

    // Calculate performance metrics
    const performanceMetrics = {
        totalFeatures: Object.keys(marketData.market_summary.key_features).length,
        avgImportance: Object.values(marketData.market_summary.key_features)
            .reduce((acc, curr) => acc + curr.average_importance, 0) / Object.keys(marketData.market_summary.key_features).length,
        totalSegments: marketData.market_summary.target_audiences.length,
        competitiveAdvantages: Object.values(marketData.market_summary.competitive_landscape.advantages)
            .reduce((acc, curr) => acc + curr.length, 0),
    };

    // Group keywords by intent
    const keywordsByIntent = marketData.keyword_insights.analysis.reduce((acc, item) => {
        if (!acc[item.intent]) {
            acc[item.intent] = [];
        }
        acc[item.intent].push(item);
        return acc;
    }, {} as Record<string, typeof marketData.keyword_insights.analysis>);

    // Helper function to extract domain from URL
    const extractDomain = (url: string): string => {
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            return domain.split('.')[0]; // Return just the domain name without TLD
        } catch {
            return url; // Return the original string if it's not a valid URL
        }
    };

    // Helper function to get favicon URL
    const getFaviconUrl = (url: string): string => {
        try {
            const domain = new URL(url).origin;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch {
            return '';
        }
    };

    return (
        <div className="bg-background overflow-hidden overflow-y-clip overscroll-y-none">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-2">
                {/* Main Content with Tabs */}
                <Tabs
                    defaultValue="intelligence"
                    className="w-full"
                    onValueChange={(value) => setActiveTab(value)}
                >
                    <div className="flex items-center justify-between mb-6">
                        <div className="text-lg font-light tracking-wide text-muted-foreground">
                            Hello, {_.startCase(_.toLower(user?.email?.split('@')[0] ?? 'User'))}
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
                                value="intelligence"
                                className="relative rounded-sm px-2 py-1 text-sm font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                                ref={(el) => {
                                    if (el && activeTab === "intelligence") {
                                        const rect = el.getBoundingClientRect();
                                        document.documentElement.style.setProperty('--tab-width', `${rect.width}px`);
                                        document.documentElement.style.setProperty('--tab-height', `${rect.height}px`);
                                        document.documentElement.style.setProperty('--tab-left', `${el.offsetLeft}px`);
                                        document.documentElement.style.setProperty('--tab-top', `${el.offsetTop}px`);
                                    }
                                }}
                            >
                                <BarChart3 className="h-4 w-4" />
                                <motion.span
                                    initial={{ opacity: 0.8 }}
                                    animate={{ opacity: activeTab === "intelligence" ? 1 : 0.8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    Market Intelligence
                                </motion.span>
                            </TabsTrigger>

                            <TabsTrigger
                                value="keywords"
                                className="relative rounded-sm px-2 py-1 text-sm font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                                ref={(el) => {
                                    if (el && activeTab === "keywords") {
                                        const rect = el.getBoundingClientRect();
                                        document.documentElement.style.setProperty('--tab-width', `${rect.width}px`);
                                        document.documentElement.style.setProperty('--tab-height', `${rect.height}px`);
                                        document.documentElement.style.setProperty('--tab-left', `${el.offsetLeft}px`);
                                        document.documentElement.style.setProperty('--tab-top', `${el.offsetTop}px`);
                                    }
                                }}
                            >
                                <TrendingUp className="h-4 w-4" />
                                <motion.span
                                    initial={{ opacity: 0.8 }}
                                    animate={{ opacity: activeTab === "keywords" ? 1 : 0.8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    Customer Queries
                                </motion.span>
                                <div className="ml-1 bg-primary/10 text-primary text-xs font-medium rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
                                    {Object.values(keywordsByIntent).reduce((total, keywords) => total + keywords.length, 0)}
                                </div>
                            </TabsTrigger>

                            <TabsTrigger
                                value="audiences"
                                className="relative rounded-sm px-2 py-1 text-sm font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                                ref={(el) => {
                                    if (el && activeTab === "audiences") {
                                        const rect = el.getBoundingClientRect();
                                        document.documentElement.style.setProperty('--tab-width', `${rect.width}px`);
                                        document.documentElement.style.setProperty('--tab-height', `${rect.height}px`);
                                        document.documentElement.style.setProperty('--tab-left', `${el.offsetLeft}px`);
                                        document.documentElement.style.setProperty('--tab-top', `${el.offsetTop}px`);
                                    }
                                }}
                            >
                                <Users className="h-4 w-4" />
                                <motion.span
                                    initial={{ opacity: 0.8 }}
                                    animate={{ opacity: activeTab === "audiences" ? 1 : 0.8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    Audiences
                                </motion.span>
                                <div className="ml-1 bg-primary/10 text-primary text-xs font-medium rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
                                    {marketData.market_summary.target_audiences.length}
                                </div>
                            </TabsTrigger>

                            <TabsTrigger
                                value="competition"
                                className="relative rounded-sm px-2 py-1 text-sm font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                                ref={(el) => {
                                    if (el && activeTab === "competition") {
                                        const rect = el.getBoundingClientRect();
                                        document.documentElement.style.setProperty('--tab-width', `${rect.width}px`);
                                        document.documentElement.style.setProperty('--tab-height', `${rect.height}px`);
                                        document.documentElement.style.setProperty('--tab-left', `${el.offsetLeft}px`);
                                        document.documentElement.style.setProperty('--tab-top', `${el.offsetTop}px`);
                                    }
                                }}
                            >
                                <Medal className="h-4 w-4" />
                                <motion.span
                                    initial={{ opacity: 0.8 }}
                                    animate={{ opacity: activeTab === "competition" ? 1 : 0.8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    Competition
                                </motion.span>
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Add animation to tab content */}
                    <div>
                        {/* Market Intelligence Tab */}
                        <TabsContent value="intelligence" className="mt-0 space-y-6">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Key Findings and Market Trends in a grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Key Findings */}
                                    <Card className="border bg-card rounded-none h-[700px] flex flex-col">
                                        <CardHeader className="border-b bg-muted/50 px-4 py-2 flex-shrink-0">
                                            <CardTitle>Recommendations</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-6 overflow-y-auto flex-1 no-scrollbar">
                                            <ul className="space-y-2">
                                                {marketData.executive_summary.key_findings.map((finding, index) => (
                                                    <li key={index} className="flex gap-2 items-start border bg-muted/50 p-4">
                                                        <div className="h-2 w-2 bg-primary mt-2" />
                                                        <span className="text-sm">{processRecommendation(finding)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </CardContent>
                                    </Card>

                                    {/* Market Trends - Condensed with Dialog */}
                                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Card className="border-none bg-card rounded-none cursor-pointer hover:bg-muted/10 transition-colors h-[700px] flex flex-col">
                                                {/* <CardHeader className="border bg-muted/50 px-4 py-2 flex flex-row items-center justify-between flex-shrink-0">
                                                    <CardTitle>Daily Market Recap</CardTitle>
                                                    <span className="text-xs text-muted-foreground">
                                                        Summarized at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </CardHeader> */}
                                                <CardContent className="pb-6 pt-0 px-0 overflow-y-auto flex-1 border-none no-scrollbar">
                                                    <div className="space-y-6">
                                                        {/* Market Trends */}
                                                        <div>
                                                            <div className="border bg-muted/50 px-4 py-3">
                                                                <div className="space-y-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-muted-foreground bg-[#4EBE96]/20 px-1 py-1 rounded-sm">Market Trends</span>
                                                                        <span className="text-xs text-muted-foreground bg-black/80 px-1 py-1 rounded-sm flex items-center gap-1.5">
                                                                            <Image src="/favicon.ico" alt="Vendere Intelligence" width={16} height={16} />
                                                                            Vendere Intelligence
                                                                        </span>
                                                                    </div>
                                                                    {Object.entries(marketData.market_analysis.trends).slice(0, 3).map(([question, answer], index) => (
                                                                        <div key={index} className="text-sm">
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <div className="h-1.5 w-1.5 bg-primary rounded-full" />
                                                                                <span className="font-medium">{processRecommendation(question)}</span>
                                                                            </div>
                                                                            <p className="text-muted-foreground line-clamp-2 ml-3.5">
                                                                                {processRecommendation(answer)}
                                                                            </p>
                                                                        </div>
                                                                    ))}
                                                                    <div className="flex items-center justify-between">
                                                                        {Object.entries(marketData.market_analysis.trends).length > 3 && (
                                                                            <span className="text-xs text-muted-foreground">
                                                                                +{Object.entries(marketData.market_analysis.trends).length - 3} more trends
                                                                            </span>
                                                                        )}
                                                                        <Button variant="ghost" size="sm" className="flex items-center gap-1">
                                                                            <span>Read more</span>
                                                                            <MaximizeIcon className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Brand Insights */}
                                                        {marketData.brand_insights.length > 0 && (
                                                            <div>
                                                                <div className="space-y-3">
                                                                    {marketData.brand_insights.map((insight, index) => (
                                                                        <div key={index} className="border bg-muted/50 p-3">
                                                                            <div className="flex items-center justify-between mb-2">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-sm">{insight.details.brand}</span>
                                                                                    {/* Citation favicons */}
                                                                                    <div className="flex relative">
                                                                                        {insight.source_urls.slice(0, 2).map((url, i) => (
                                                                                            <div
                                                                                                key={i}
                                                                                                className="w-4 h-4 rounded-full border border-background overflow-hidden bg-white"
                                                                                                style={{
                                                                                                    marginLeft: i > 0 ? '-6px' : '0',
                                                                                                    zIndex: 2 - i,
                                                                                                    position: 'relative'
                                                                                                }}
                                                                                            >
                                                                                                <img
                                                                                                    src={getFaviconUrl(url)}
                                                                                                    alt={extractDomain(url)}
                                                                                                    className="w-full h-full object-contain"
                                                                                                    onError={(e) => {
                                                                                                        const target = e.target as HTMLImageElement;
                                                                                                        target.style.display = 'none';
                                                                                                        target.parentElement!.innerHTML = extractDomain(url).charAt(0).toUpperCase();
                                                                                                        target.parentElement!.style.display = 'flex';
                                                                                                        target.parentElement!.style.alignItems = 'center';
                                                                                                        target.parentElement!.style.justifyContent = 'center';
                                                                                                        target.parentElement!.style.backgroundColor = '#f0f0f0';
                                                                                                        target.parentElement!.style.color = '#333';
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex gap-2">
                                                                                    {insight.details.segments.slice(0, 2).map((segment, index) => (
                                                                                        <span key={index} className="text-xs px-2 py-1 bg-muted rounded-sm">
                                                                                            {segment}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                            <p className="text-sm text-muted-foreground">
                                                                                {insight.insight}
                                                                            </p>

                                                                            {insight.details.features.length > 0 && (
                                                                                <div className="mt-3 flex gap-2">
                                                                                    {insight.details.features.slice(0, 2).map((feature, i) => (
                                                                                        <span key={i} className="text-xs text-muted-foreground bg-muted/50 px-2 py-1">
                                                                                            {feature}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Market Insights */}
                                                        {marketData.market_insights.length > 0 && (
                                                            <div>
                                                                <div className="space-y-3">
                                                                    {marketData.market_insights.map((insight, index) => (
                                                                        <div key={index} className="border bg-muted/50 p-3">
                                                                            <div className="flex items-center justify-between mb-2">
                                                                                <div className="flex relative">
                                                                                    {insight.source_urls.slice(0, 2).map((url, i) => (
                                                                                        <div
                                                                                            key={i}
                                                                                            className="w-4 h-4 rounded-full border border-background overflow-hidden bg-white"
                                                                                            style={{
                                                                                                marginLeft: i > 0 ? '-6px' : '0',
                                                                                                zIndex: 2 - i,
                                                                                                position: 'relative'
                                                                                            }}
                                                                                        >
                                                                                            <img
                                                                                                src={getFaviconUrl(url)}
                                                                                                alt={extractDomain(url)}
                                                                                                className="w-full h-full object-contain"
                                                                                                onError={(e) => {
                                                                                                    const target = e.target as HTMLImageElement;
                                                                                                    target.style.display = 'none';
                                                                                                    target.parentElement!.innerHTML = extractDomain(url).charAt(0).toUpperCase();
                                                                                                    target.parentElement!.style.display = 'flex';
                                                                                                    target.parentElement!.style.alignItems = 'center';
                                                                                                    target.parentElement!.style.justifyContent = 'center';
                                                                                                    target.parentElement!.style.backgroundColor = '#f0f0f0';
                                                                                                    target.parentElement!.style.color = '#333';
                                                                                                }}
                                                                                            />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                                {insight.details.key_segments.length > 0 && (
                                                                                    <span className="text-xs px-2 py-1 bg-muted rounded-sm">
                                                                                        {insight.details.key_segments[0]}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <p className="text-sm text-muted-foreground">
                                                                                {insight.insight}
                                                                            </p>


                                                                            {insight.details.price_ranges.length > 0 && (
                                                                                <div className="mt-3 flex gap-2">
                                                                                    {insight.details.price_ranges.slice(1, 2).map((range, i) => (
                                                                                        <span key={i} className="text-xs text-muted-foreground bg-muted/50 px-2 py-1">
                                                                                            {range}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </DialogTrigger>
                                        <DialogContent className="rounded-none sm:max-w-[800px] max-h-[80vh] overflow-y-auto no-scrollbar">
                                            <DialogHeader>
                                                {/* <DialogTitle className="text-sm font-medium">Market Trends</DialogTitle> */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground bg-[#4EBE96]/20 px-1 py-1 rounded-sm">Market Trends</span>
                                                    <span className="text-xs text-muted-foreground bg-black/80 px-1 py-1 rounded-sm flex items-center gap-1.5">
                                                        <Image src="/favicon.ico" alt="Vendere Intelligence" width={16} height={16} />
                                                        Vendere Intelligence
                                                    </span>
                                                </div>
                                            </DialogHeader>
                                            <div className="space-y-6 py-4">
                                                {/* Market Trends */}
                                                <div>
                                                    <div className="space-y-4">
                                                        {Object.entries(marketData.market_analysis.trends).map(([question, answer], index) => (
                                                            <div key={index} className="border bg-muted/50 p-4 space-y-2">
                                                                <h3 className="text-sm font-medium">{processRecommendation(question)}</h3>
                                                                <p className="text-sm text-muted-foreground">{processRecommendation(answer)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </motion.div>
                        </TabsContent>

                        {/* Keywords Tab */}
                        <TabsContent value="keywords" className="mt-0 overflow-y-auto">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="relative overflow-y-auto h-[750px] no-scrollbar">
                                    {/* Scroll hint indicator */}
                                    <div className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-gradient-to-l from-background to-transparent w-12 h-full z-10 pointer-events-none flex items-center justify-end pr-2">
                                        <div className="h-8 w-8 rounded-full bg-muted/80 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground animate-pulse">
                                                <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                        </div>
                                    </div>

                                    <div className="flex overflow-x-auto pb-6 pt-2 space-x-6 snap-x no-scrollbar">
                                        {Object.entries(keywordsByIntent).map(([intent, keywords]) => (
                                            <div key={intent} className="min-w-[300px] max-w-[350px] flex-shrink-0 snap-start border-t-2 border-muted pt-2">
                                                <h3 className="text-sm font-medium capitalize mb-3 sticky top-0 bg-background py-1">{intent}</h3>
                                                <div className="space-y-3">
                                                    {keywords
                                                        .sort((a, b) => b.likelihood - a.likelihood)
                                                        .map((keyword, index) => (
                                                            <div
                                                                key={index}
                                                                className="flex items-center justify-between p-3 border bg-muted/50 relative"
                                                            >
                                                                <span className="text-sm truncate">{keyword.keyword}</span>
                                                                <div className="flex items-center gap-2">
                                                                    {/* Citations display */}
                                                                    {keyword.citations && keyword.citations.length > 0 && (
                                                                        <TooltipProvider>
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <div className="flex items-center cursor-pointer">
                                                                                        {/* Display up to 2 favicons in a layered style */}
                                                                                        <div className="flex relative">
                                                                                            {keyword.citations.slice(0, 2).map((citation, i) => (
                                                                                                <div
                                                                                                    key={i}
                                                                                                    className="w-4 h-4 rounded-full border border-background overflow-hidden bg-white"
                                                                                                    style={{
                                                                                                        marginLeft: i > 0 ? '-6px' : '0',
                                                                                                        zIndex: 2 - i,
                                                                                                        position: 'relative'
                                                                                                    }}
                                                                                                >
                                                                                                    <img
                                                                                                        src={getFaviconUrl(citation)}
                                                                                                        alt={extractDomain(citation)}
                                                                                                        className="w-full h-full object-contain"
                                                                                                        onError={(e) => {
                                                                                                            const target = e.target as HTMLImageElement;
                                                                                                            target.style.display = 'none';
                                                                                                            target.parentElement!.innerHTML = extractDomain(citation).charAt(0).toUpperCase();
                                                                                                            target.parentElement!.style.display = 'flex';
                                                                                                            target.parentElement!.style.alignItems = 'center';
                                                                                                            target.parentElement!.style.justifyContent = 'center';
                                                                                                            target.parentElement!.style.backgroundColor = '#f0f0f0';
                                                                                                            target.parentElement!.style.color = '#333';
                                                                                                        }}
                                                                                                    />
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent>
                                                                                    <div className="space-y-1 max-w-xs">
                                                                                        <p className="text-xs font-medium">Sources:</p>
                                                                                        <ul className="text-xs">
                                                                                            {keyword.citations.slice(0, 3).map((citation, i) => (
                                                                                                <li key={i} className="flex items-center gap-1">
                                                                                                    <div className="w-3 h-3 rounded-full overflow-hidden bg-white">
                                                                                                        <img
                                                                                                            src={getFaviconUrl(citation)}
                                                                                                            alt=""
                                                                                                            className="w-full h-full object-contain"
                                                                                                        />
                                                                                                    </div>
                                                                                                    <span>{extractDomain(citation)}</span>
                                                                                                </li>
                                                                                            ))}
                                                                                            {keyword.citations.length > 3 && (
                                                                                                <li className="text-xs text-muted-foreground">
                                                                                                    +{keyword.citations.length - 3} more
                                                                                                </li>
                                                                                            )}
                                                                                        </ul>
                                                                                    </div>
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        </TooltipProvider>
                                                                    )}
                                                                    <span
                                                                        className={`text-xs px-2 py-1 ${keyword.likelihood >= 0.7
                                                                            ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                                                            : keyword.likelihood >= 0.4
                                                                                ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                                                                                : 'bg-red-500/10 text-red-700 dark:text-red-400'
                                                                            }`}
                                                                    >
                                                                        {(keyword.likelihood * 100).toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        </TabsContent>

                        {/* Target Audiences Tab */}
                        <TabsContent value="audiences" className="mt-0">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="space-y-6 overflow-y-auto h-[750px] no-scrollbar">
                                    {marketData.market_summary.target_audiences.map((audience, index) => (
                                        <div key={index} className="border bg-muted/50 p-4 relative">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-sm font-medium">{audience.segment}</h3>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1">
                                                        {audience.buying_stage}
                                                    </span>

                                                    {/* Citations display - moved inside the header flex container */}
                                                    {audience.citations && audience.citations.length > 0 && (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <div className="flex items-center cursor-pointer">
                                                                        {/* Display up to 3 favicons in a layered style */}
                                                                        <div className="flex relative">
                                                                            {audience.citations.slice(0, 3).map((citation, i) => (
                                                                                <div
                                                                                    key={i}
                                                                                    className="w-5 h-5 rounded-full border border-background overflow-hidden bg-white"
                                                                                    style={{
                                                                                        marginLeft: i > 0 ? '-6px' : '0',
                                                                                        zIndex: 3 - i,
                                                                                        position: 'relative'
                                                                                    }}
                                                                                >
                                                                                    <img
                                                                                        src={getFaviconUrl(citation)}
                                                                                        alt={extractDomain(citation)}
                                                                                        className="w-full h-full object-contain"
                                                                                        onError={(e) => {
                                                                                            // If favicon fails to load, show the first letter of the domain
                                                                                            const target = e.target as HTMLImageElement;
                                                                                            target.style.display = 'none';
                                                                                            target.parentElement!.innerHTML = extractDomain(citation).charAt(0).toUpperCase();
                                                                                            target.parentElement!.style.display = 'flex';
                                                                                            target.parentElement!.style.alignItems = 'center';
                                                                                            target.parentElement!.style.justifyContent = 'center';
                                                                                            target.parentElement!.style.backgroundColor = '#f0f0f0';
                                                                                            target.parentElement!.style.color = '#333';
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                            ))}
                                                                        </div>

                                                                        {/* Display the name of the top source */}
                                                                        {audience.citations.length > 0 && (
                                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                                {extractDomain(audience.citations[0])}
                                                                                {audience.citations.length > 1 && ` +${audience.citations.length - 1}`}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <div className="space-y-1 max-w-xs">
                                                                        <p className="text-xs font-medium">Sources:</p>
                                                                        <ul className="text-xs">
                                                                            {audience.citations.slice(0, 5).map((citation, i) => (
                                                                                <li key={i} className="flex items-center gap-1">
                                                                                    <div className="w-3 h-3 rounded-full overflow-hidden bg-white">
                                                                                        <img
                                                                                            src={getFaviconUrl(citation)}
                                                                                            alt=""
                                                                                            className="w-full h-full object-contain"
                                                                                        />
                                                                                    </div>
                                                                                    <span>{extractDomain(citation)}</span>
                                                                                </li>
                                                                            ))}
                                                                            {audience.citations.length > 5 && (
                                                                                <li className="text-xs text-muted-foreground">
                                                                                    +{audience.citations.length - 5} more
                                                                                </li>
                                                                            )}
                                                                        </ul>
                                                                    </div>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                {/* Characteristics */}
                                                <div>
                                                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Characteristics</h4>
                                                    <ul className="space-y-2">
                                                        {audience.details.characteristics.map((char, i) => (
                                                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                                                                <span className="h-1.5 w-1.5 bg-primary mt-1.5" />
                                                                {char}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>

                                                {/* Preferences */}
                                                <div>
                                                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Preferences</h4>
                                                    <ul className="space-y-2">
                                                        {audience.details.preferences.map((pref, i) => (
                                                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                                                                <span className="h-1.5 w-1.5 bg-blue-500 mt-1.5" />
                                                                {pref}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>

                                                {/* Pain Points */}
                                                <div>
                                                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Pain Points</h4>
                                                    <ul className="space-y-2">
                                                        {audience.pain_points.map((point, i) => (
                                                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                                                                <span className="h-1.5 w-1.5 bg-red-500 mt-1.5" />
                                                                {point}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </TabsContent>

                        {/* Competition Tab */}
                        <TabsContent value="competition" className="mt-0">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                            >
                                <Tabs defaultValue="advantages" className="w-full">
                                    <div className="mb-6">
                                        <TabsList className="w-full justify-start h-auto gap-4 bg-transparent p-0 border-0">
                                            <TabsTrigger
                                                value="advantages"
                                                className="rounded-none data-[state=active]:bg-muted/50 data-[state=active]:text-foreground px-3 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-2 border-0"
                                            >
                                                Competitive Advantages
                                                <div className="ml-1 bg-primary/10 text-primary text-xs font-medium rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                                                    {performanceMetrics.competitiveAdvantages}
                                                </div>
                                            </TabsTrigger>
                                            {/* <TabsTrigger
                                                value="features"
                                                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 text-sm font-medium"
                                            >
                                                Feature Comparison
                                            </TabsTrigger> */}
                                            <TabsTrigger
                                                value="analysis"
                                                className="rounded-none data-[state=active]:bg-muted/50 data-[state=active]:text-foreground px-3 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-2 border-0"
                                            >
                                                Core Features
                                                <div className="ml-1 bg-primary/10 text-primary text-xs font-medium rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                                                    {performanceMetrics.totalFeatures}
                                                </div>
                                            </TabsTrigger>
                                            {Object.keys(marketData.market_summary.competitive_landscape.market_positioning).length > 0 && (
                                                <TabsTrigger
                                                    value="positioning"
                                                    className="data-[state=active]:bg-muted/50 data-[state=active]:text-foreground rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground border-0"
                                                >
                                                    Market Positioning
                                                </TabsTrigger>
                                            )}
                                        </TabsList>
                                    </div>

                                    {/* Competitive Advantages Sub-Tab */}
                                    <TabsContent value="advantages" className="mt-0">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-[700px] overflow-y-auto no-scrollbar">
                                            {Object.entries(marketData.market_summary.competitive_landscape.advantages).map(([category, advantages]) => (
                                                <div key={category} className="border bg-muted/50 p-4">
                                                    <h3 className="text-sm font-medium capitalize mb-3">{category}</h3>
                                                    <ul className="space-y-2">
                                                        {advantages.slice(0, 10).map((advantage, i) => (
                                                            <li key={i} className="text-sm text-muted-foreground flex gap-2 items-start">
                                                                <div className="h-2 w-2 bg-primary mt-2 flex-shrink-0" />
                                                                <span>{advantage}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    {advantages.length > 10 && (
                                                        <Dialog>
                                                            <DialogTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="mt-2 text-xs text-primary">
                                                                    See {advantages.length - 10} more
                                                                </Button>
                                                            </DialogTrigger>
                                                            <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
                                                                <DialogHeader>
                                                                    <DialogTitle className="capitalize">{category} Advantages</DialogTitle>
                                                                </DialogHeader>
                                                                <div className="py-4">
                                                                    <ul className="space-y-2">
                                                                        {advantages.map((advantage, i) => (
                                                                            <li key={i} className="text-sm flex gap-2 items-start">
                                                                                <div className="h-2 w-2 bg-primary mt-2 flex-shrink-0" />
                                                                                <span>{advantage}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            </DialogContent>
                                                        </Dialog>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </TabsContent>

                                    {/* Feature Comparison Sub-Tab
                                    <TabsContent value="features" className="mt-0">
                                        <div className="flex items-center justify-between border-b border-border/50 pb-2 px-6 mb-6">
                                            <div className="flex items-center gap-4">
                                                <div>
                                                    <h3 className="text-sm font-medium tracking-tight">Average Importance</h3>
                                                    <p className="text-xs text-muted-foreground">Feature importance score</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <div className="text-xl font-medium">{(performanceMetrics.avgImportance * 100).toFixed(1)}%</div>
                                                <div className="text-xs text-muted-foreground">across all features</div>
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse">
                                                <thead>
                                                    <tr className="bg-muted/50 border-b">
                                                        <th className="text-left p-3 text-sm font-medium">Feature</th>
                                                        <th className="text-left p-3 text-sm font-medium">Importance</th>
                                                        <th className="text-left p-3 text-sm font-medium">Benefits</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Object.entries(marketData.market_summary.competitive_landscape.feature_comparison)
                                                        .sort((a, b) => b[1].importance_score - a[1].importance_score)
                                                        .map(([feature, data]) => (
                                                            <tr key={feature} className="border-b hover:bg-muted/30">
                                                                <td className="p-3 text-sm">{feature}</td>
                                                                <td className="p-3 text-sm">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                                                            <div
                                                                                className="h-full bg-primary"
                                                                                style={{ width: `${data.importance_score * 100}%` }}
                                                                            />
                                                                        </div>
                                                                        <span>{(data.importance_score * 100).toFixed(0)}%</span>
                                                                    </div>
                                                                </td>
                                                                <td className="p-3 text-sm">
                                                                    <ul className="space-y-1">
                                                                        {data.benefits.map((benefit, i) => (
                                                                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                                                                                <span className="h-1.5 w-1.5 bg-blue-500 mt-1.5" />
                                                                                {benefit}
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </TabsContent> */}

                                    {/* Key Features Analysis Sub-Tab */}
                                    <TabsContent value="analysis" className="mt-0">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-[700px] overflow-y-auto no-scrollbar">
                                            {Object.entries(marketData.market_summary.key_features)
                                                .sort((a, b) => b[1].average_importance - a[1].average_importance)
                                                .map(([feature, data]) => (
                                                    <div key={feature} className="border bg-muted/50 p-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h3 className="text-sm font-medium">{feature}</h3>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs px-2 py-1 bg-muted">
                                                                    {(data.average_importance * 100).toFixed(0)}%
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {data.frequency}x
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <ul className="space-y-1">
                                                            {data.benefits.slice(0, 3).map((benefit, i) => (
                                                                <li key={i} className="text-sm text-muted-foreground flex gap-2 items-start">
                                                                    <div className="h-2 w-2 bg-green-500 mt-2 flex-shrink-0" />
                                                                    <span>{benefit}</span>
                                                                </li>
                                                            ))}
                                                            {data.benefits.length > 3 && (
                                                                <li className="text-xs text-muted-foreground mt-1">
                                                                    +{data.benefits.length - 3} more benefits
                                                                </li>
                                                            )}
                                                        </ul>
                                                    </div>
                                                ))}
                                        </div>
                                    </TabsContent>

                                    {/* Market Positioning Sub-Tab - Only show if data exists */}
                                    {Object.keys(marketData.market_summary.competitive_landscape.market_positioning).length > 0 && (
                                        <TabsContent value="positioning" className="mt-0">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {Object.entries(marketData.market_summary.competitive_landscape.market_positioning).map(([company, positioning]) => (
                                                    <div key={company} className="border bg-muted/50 p-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h3 className="text-sm font-medium">{company}</h3>
                                                            <div className="flex items-center">
                                                                <span className="text-xs px-2 py-1 bg-muted">
                                                                    Strength: {positioning.strength}/10
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <div>
                                                                <h4 className="text-xs font-medium text-muted-foreground mb-1">Opportunity</h4>
                                                                <p className="text-sm">{positioning.opportunity}</p>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-xs font-medium text-muted-foreground mb-1">Differentiators</h4>
                                                                <ul className="space-y-1">
                                                                    {positioning.differentiators.map((diff, i) => (
                                                                        <li key={i} className="text-sm text-muted-foreground flex gap-2 items-start">
                                                                            <div className="h-2 w-2 bg-primary mt-2 flex-shrink-0" />
                                                                            <span>{diff}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-xs font-medium text-muted-foreground mb-1">Competitors</h4>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {positioning.competitors.map((competitor, i) => (
                                                                        <span key={i} className="text-xs px-2 py-1 bg-muted rounded-sm">
                                                                            {competitor}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </TabsContent>
                                    )}
                                </Tabs>
                            </motion.div>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    );
}
