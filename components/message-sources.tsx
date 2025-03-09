'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ExternalLink, FileText, Image as ImageIcon, Globe, Tag, Info, ArrowRight, Link as LinkIcon, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';
import { supabase } from '@/lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';

export interface Source {
    id: string;
    text: string;
    score: number;
    extra_info: {
        type: 'ad' | 'market_research' | 'citation' | 'attribution_campaign' | 'attribution_channel' | string;
        id: string;
        url?: string;
        image_url?: string;
        name?: string;
        domain?: string;
        raw_data?: any; // For attribution data
    };
}

interface MessageSourcesProps {
    sources: Source[];
    citations?: string[];
}

interface SourceRecord {
    id: string;
    name?: string;
    image_url?: string;
    intent_summary?: string;
    description?: string;
    created_at?: string;
    keywords?: KeywordItem[];
    buying_stage?: string;
    primary_intent?: string;
    site_url?: string;
    preview_url?: string;
    type?: string;
    features?: string[];
    // For attribution data
    campaign_id?: string;
    ad_id?: string;
    avg_ctr?: number;
    avg_roas?: number;
    avg_conversion_rate?: number;
}

// Define a more specific type for keywords
interface KeywordItem {
    keyword?: string;
    term?: string;
}

// Function to extract domain from URL
function extractDomain(url: string): string {
    try {
        const domain = new URL(url).hostname;
        return domain.replace(/^www\./, '');
    } catch {
        return url;
    }
}

// Function to get favicon URL
function getFaviconUrl(domain: string): string {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function MessageSources({ sources, citations = [] }: MessageSourcesProps) {
    const [isVisible, setIsVisible] = useState(true);
    const [sourceRecords, setSourceRecords] = useState<Record<string, SourceRecord>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'citations' | 'sources'>('citations');
    const totalItems = sources.length + citations.length;

    useEffect(() => {
        async function fetchSourceRecords() {
            if (!sources || sources.length === 0) {
                setIsLoading(false);
                return;
            }

            const recordsMap: Record<string, SourceRecord> = {};

            // Group sources by type to batch fetch
            const marketResearchIds: string[] = [];
            const libraryItemIds: string[] = [];
            const citationResearchIds: string[] = [];
            const attributionCampaignIds: string[] = [];
            const attributionChannelIds: string[] = [];

            sources.forEach(source => {
                const { type, id } = source.extra_info;
                if (type === 'market_research') marketResearchIds.push(id);
                else if (type === 'visual') libraryItemIds.push(id);
                else if (type === 'citation') citationResearchIds.push(id);
                else if (type === 'attribution_campaign') attributionCampaignIds.push(id);
                else if (type === 'attribution_channel') attributionChannelIds.push(id);
            });

            // Fetch market research records
            if (marketResearchIds.length > 0) {
                const { data: marketData } = await supabase
                    .from('market_research_v2')
                    .select('id, image_url, intent_summary, created_at, keywords, buying_stage')
                    .in('id', marketResearchIds);

                if (marketData) {
                    marketData.forEach(record => {
                        recordsMap[record.id] = record;
                    });
                }
            }

            // Fetch library items (ads)
            if (libraryItemIds.length > 0) {
                const { data: libraryData } = await supabase
                    .from('library_items')
                    .select('id, name, description, preview_url, features, created_at, type')
                    .in('id', libraryItemIds);

                if (libraryData) {
                    libraryData.forEach(record => {
                        recordsMap[record.id] = {
                            ...record,
                            id: record.id,
                            image_url: record.preview_url
                        };
                    });
                }
            }

            // Fetch citation research
            if (citationResearchIds.length > 0) {
                const { data: citationData } = await supabase
                    .from('citation_research')
                    .select('id, image_url, intent_summary, created_at, keywords, primary_intent, site_url, buying_stage')
                    .in('id', citationResearchIds);

                if (citationData) {
                    citationData.forEach(record => {
                        recordsMap[record.id] = record;
                    });
                }
            }

            // Fetch attribution campaign data and associated ads
            if (attributionCampaignIds.length > 0) {
                // First get the campaign metrics
                const { data: campaignData } = await supabase
                    .from('enhanced_ad_metrics_by_campaign')
                    .select('*')
                    .in('campaign_id', attributionCampaignIds);

                if (campaignData) {
                    // Map campaign data to records
                    campaignData.forEach(record => {
                        recordsMap[record.campaign_id] = {
                            ...record,
                            id: record.campaign_id,
                            name: `Campaign: ${record.campaign_id}`,
                            avg_ctr: record.avg_ctr,
                            avg_roas: record.avg_roas,
                            avg_conversion_rate: record.avg_conversion_rate
                        };
                    });

                    // Try to get ad details for campaigns from enhanced_ad_metrics
                    const campaignWithAds = campaignData.filter(c => c.campaign_id);
                    if (campaignWithAds.length > 0) {
                        // Get ad IDs for these campaigns
                        const { data: adMetricsData } = await supabase
                            .from('enhanced_ad_metrics')
                            .select('ad_id, campaign_id')
                            .in('campaign_id', campaignWithAds.map(c => c.campaign_id));

                        if (adMetricsData && adMetricsData.length > 0) {
                            // Get unique ad IDs
                            const adIds = [...new Set(adMetricsData.map(item => item.ad_id))];

                            // Fetch library items for these ad IDs
                            const { data: adLibraryData } = await supabase
                                .from('library_items')
                                .select('id, name, preview_url, features, created_at, type')
                                .in('item_id', adIds);

                            if (adLibraryData) {
                                // Map ads to their campaigns
                                adMetricsData.forEach(adMetric => {
                                    const matchingAd = adLibraryData.find(ad => ad.item_id === adMetric.ad_id);
                                    if (matchingAd && recordsMap[adMetric.campaign_id]) {
                                        // Add ad details to the campaign record
                                        recordsMap[adMetric.campaign_id] = {
                                            ...recordsMap[adMetric.campaign_id],
                                            image_url: matchingAd.preview_url,
                                            ad_id: adMetric.ad_id,
                                            features: matchingAd.features
                                        };
                                    }
                                });
                            }
                        }
                    }
                }
            }

            // Fetch attribution channel data
            if (attributionChannelIds.length > 0) {
                // For channel data, we need to extract the channel name from the combined ID
                const channelNames = attributionChannelIds.map(id => id.split('_')[0]);

                // Get the channel metrics
                const { data: channelData } = await supabase
                    .from('enhanced_ad_metrics_by_channel')
                    .select('*')
                    .in('channel', channelNames);

                if (channelData) {
                    channelData.forEach(record => {
                        const channelId = `${record.channel}_${record.date || ''}`;
                        if (attributionChannelIds.includes(channelId)) {
                            recordsMap[channelId] = {
                                ...record,
                                id: channelId,
                                name: `Channel: ${record.channel}${record.date ? ` (${record.date})` : ''}`,
                                avg_ctr: record.avg_ctr,
                                avg_conversion_rate: record.avg_conversion_rate
                            };
                        }
                    });
                }
            }

            setSourceRecords(recordsMap);
            setIsLoading(false);
        }

        fetchSourceRecords();
    }, [sources]);

    if (!totalItems) {
        return null;
    }

    return (
        <div className="mb-2">
            <div className="flex items-center justify-between mb-3">
                <Tabs defaultValue="citations" className="w-full" onValueChange={(value) => setActiveTab(value as 'citations' | 'sources')}>
                    <div className="flex items-center justify-between">
                        <TabsList className="h-auto bg-transparent p-0 gap-4 relative">
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
                                value="citations"
                                className="relative rounded-sm px-3 py-1.5 text-xs font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                                ref={(el) => {
                                    if (el && activeTab === "citations") {
                                        const rect = el.getBoundingClientRect();
                                        document.documentElement.style.setProperty('--tab-width', `${rect.width}px`);
                                        document.documentElement.style.setProperty('--tab-height', `${rect.height}px`);
                                        document.documentElement.style.setProperty('--tab-left', `${el.offsetLeft}px`);
                                        document.documentElement.style.setProperty('--tab-top', `${el.offsetTop}px`);
                                    }
                                }}
                            >
                                <motion.span
                                    initial={{ opacity: 0.8 }}
                                    animate={{ opacity: activeTab === "citations" ? 1 : 0.8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    Citations ({citations.length})
                                </motion.span>
                            </TabsTrigger>

                            <TabsTrigger
                                value="sources"
                                className="relative rounded-sm px-3 py-1.5 text-xs font-medium flex items-center gap-2 z-10 data-[state=active]:bg-transparent"
                                ref={(el) => {
                                    if (el && activeTab === "sources") {
                                        const rect = el.getBoundingClientRect();
                                        document.documentElement.style.setProperty('--tab-width', `${rect.width}px`);
                                        document.documentElement.style.setProperty('--tab-height', `${rect.height}px`);
                                        document.documentElement.style.setProperty('--tab-left', `${el.offsetLeft}px`);
                                        document.documentElement.style.setProperty('--tab-top', `${el.offsetTop}px`);
                                    }
                                }}
                            >
                                <motion.span
                                    initial={{ opacity: 0.8 }}
                                    animate={{ opacity: activeTab === "sources" ? 1 : 0.8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    From Your Library ({sources.length})
                                </motion.span>
                            </TabsTrigger>
                        </TabsList>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs rounded-none text-white/50 hover:text-white/80"
                            onClick={() => setIsVisible(!isVisible)}
                        >
                            {isVisible ? 'Hide' : 'Show'}
                        </Button>
                    </div>

                    {isVisible && (
                        <div className="mt-3">
                            <TabsContent value="citations">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="flex overflow-x-auto gap-2 pb-2 no-scrollbar snap-x"
                                >
                                    {citations.map((citation, index) => (
                                        <CitationCard
                                            key={`citation-${index}`}
                                            citation={citation}
                                            index={index + 1}
                                        />
                                    ))}
                                </motion.div>
                            </TabsContent>

                            <TabsContent value="sources">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="flex overflow-x-auto gap-2 pb-2 no-scrollbar snap-x"
                                >
                                    {sources.map((source) => (
                                        <SourceCard
                                            key={`source-${source.extra_info.id}`}
                                            source={source}
                                            record={sourceRecords[source.extra_info.id]}
                                            isLoading={isLoading}
                                        />
                                    ))}
                                </motion.div>
                            </TabsContent>
                        </div>
                    )}
                </Tabs>
            </div>
        </div>
    );
}

// New component for citation cards
function CitationCard({ citation, index }: { citation: string; index: number }) {
    const domain = extractDomain(citation);
    const faviconUrl = getFaviconUrl(domain);

    // Truncate URL for display
    const displayUrl = domain.length > 25
        ? domain.substring(0, 22) + '...'
        : domain;

    return (
        <div className="flex flex-col rounded-none bg-background/30 hover:bg-background/50 transition-colors border border-border/30 min-w-[200px] w-[200px] overflow-hidden flex-shrink-0 snap-start">
            {/* Header with index number, favicon and domain */}
            <div className="flex items-center p-1 border-b border-border/20">
                <div className="flex items-center justify-center min-w-5 h-5 mr-2 rounded-sm bg-gray-500/30 text-xs text-white/80">
                    {index}
                </div>

                <div className="relative h-6 w-6 rounded-sm overflow-hidden mr-1 flex-shrink-0 bg-background/50 flex items-center justify-center">
                    <Image
                        src={faviconUrl}
                        alt={domain}
                        width={16}
                        height={16}
                        className="object-contain"
                    />
                </div>

                <div className="flex-grow min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate">
                        {displayUrl}
                    </div>
                </div>

                <Link
                    href={citation}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <div className="flex items-center justify-center w-6 h-6 rounded-none hover:bg-white/10 transition-colors border-white/20">
                        <ArrowRight className="h-4 w-4 text-white/50" />
                    </div>
                </Link>
            </div>

            {/* Link display area */}
            <div className="p-1.5">
                <div className="flex flex-wrap gap-1.5 p-0">
                    <div className="flex items-center text-xs text-white/60">
                        <LinkIcon className="h-3 w-3 mr-1" />
                        <Link
                            href={citation}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-white/80 line-clamp-1 transition-colors"
                        >
                            {citation.length > 40 ? citation.substring(0, 37) + '...' : citation}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SourceCard({ source, record, isLoading }: {
    source: Source;
    record?: SourceRecord;
    isLoading: boolean;
}) {
    const { type, id, url, image_url: sourceImageUrl, name, domain } = source.extra_info;

    // Use record data if available, otherwise fall back to source data
    const displayName = record?.name || name || (domain ? domain.replace(/^www\./, '') : "Untitled Source");
    const imageUrl = record?.image_url || sourceImageUrl;
    const keywords = record?.keywords || [];
    const buyingStage = record?.buying_stage;

    // Attribution-specific data
    const isAttribution = type === "attribution_campaign" || type === "attribution_channel";
    const avgCtr = record?.avg_ctr;
    const avgRoas = record?.avg_roas;
    const avgConversionRate = record?.avg_conversion_rate;

    // Determine the link to use
    let linkHref = '#';

    if (url) {
        linkHref = url;
    } else if (type === "ad" || (record?.ad_id && isAttribution)) {
        // For attribution sources with ad_id, link to the ad
        linkHref = `/library/${record?.ad_id || id}`;
    } else if (type === "visual") {
        linkHref = `/library/${id}`;
    } else if (type === "market_research" || type === "citation") {
        linkHref = `/market/${id}`;
    } else if (isAttribution) {
        // For attribution sources without ad_id, create a filtered analytics link
        const filterParam = type === "attribution_campaign"
            ? `campaign_id=${id}`
            : `channel=${id.split('_')[0]}`;
        linkHref = `/analytics?${filterParam}`;
    }

    return (
        <div className="flex flex-col rounded-none bg-background/30 hover:bg-background/50 transition-colors border border-border/30 min-w-[200px] w-[200px] overflow-hidden flex-shrink-0 snap-start">
            {/* Header without index number */}
            <div className="flex items-center p-1 border-b border-border/20">
                <div className="relative h-6 w-6 rounded-sm overflow-hidden mr-3 flex-shrink-0 bg-background/50 flex items-center justify-center">
                    {imageUrl ? (
                        <Image
                            src={imageUrl}
                            alt={displayName}
                            fill
                            className="object-cover"
                        />
                    ) : (
                        <SourceIcon type={type} />
                    )}
                </div>

                <div className="flex-grow min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate">
                        {displayName}
                    </div>
                    {domain && (
                        <div className="text-xs text-white/50 truncate">
                            {domain.replace(/^www\./, '')}
                        </div>
                    )}
                </div>

                <Link
                    href={linkHref}
                    target={url ? "_blank" : "_self"}
                    rel={url ? "noopener noreferrer" : ""}
                >
                    <div className="flex items-center justify-center w-6 h-6 rounded-none hover:bg-white/10 transition-colors border-white/20">
                        <ArrowRight className="h-4 w-4 text-white/50" />
                    </div>
                </Link>
            </div>

            {/* Content area */}
            <div className="p-1.5">
                {isLoading ? (
                    <div className="animate-pulse h-16 bg-background/40 rounded"></div>
                ) : (
                    <>
                        {/* Metadata section */}
                        <div className="flex flex-wrap gap-1.5 p-0">
                            {/* Attribution metrics if available */}
                            {isAttribution && (
                                <>
                                    {avgCtr !== null && avgCtr !== undefined && (
                                        <div className="flex items-center text-xs text-white/60">
                                            <TrendingUp className="h-3 w-3 mr-1" />
                                            CTR: {(avgCtr * 100).toFixed(2)}%
                                        </div>
                                    )}
                                    {avgRoas !== null && avgRoas !== undefined && (
                                        <div className="flex items-center text-xs text-white/60">
                                            <TrendingUp className="h-3 w-3 mr-1" />
                                            ROAS: {avgRoas.toFixed(2)}x
                                        </div>
                                    )}
                                    {avgConversionRate !== null && avgConversionRate !== undefined && (
                                        <div className="flex items-center text-xs text-white/60">
                                            <TrendingUp className="h-3 w-3 mr-1" />
                                            Conv: {(avgConversionRate * 100).toFixed(2)}%
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Regular metadata */}
                            {buyingStage && (
                                <div className="flex items-center text-xs text-white/60">
                                    <Info className="h-3 w-3 mr-1" />
                                    {buyingStage}
                                </div>
                            )}

                            {Array.isArray(keywords) && keywords.length > 0 && (
                                <div className="flex items-center text-xs text-white/60">
                                    <Tag className="h-3 w-3 mr-1" />
                                    {typeof keywords[0] === 'string'
                                        ? keywords[0]
                                        : keywords[0]?.keyword || keywords[0]?.term || ''}
                                </div>
                            )}

                            {/* Features for ad content or attribution linked to ads */}
                            {record?.features && record.features.length > 0 && (
                                <div className="flex items-center text-xs text-white/60">
                                    <Tag className="h-3 w-3 mr-1" />
                                    {record.features[0]}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function SourceIcon({ type }: { type: string }) {
    switch (type) {
        case 'ad':
        case 'visual':
            return <ImageIcon className="h-4 w-4 text-blue-400" />;
        case 'market_research':
            return <FileText className="h-4 w-4 text-green-400" />;
        case 'citation':
            return <ExternalLink className="h-4 w-4 text-purple-400" />;
        case 'attribution_campaign':
            return <TrendingUp className="h-4 w-4 text-orange-400" />;
        case 'attribution_channel':
            return <TrendingUp className="h-4 w-4 text-yellow-400" />;
        default:
            return <Globe className="h-4 w-4 text-gray-400" />;
    }
} 