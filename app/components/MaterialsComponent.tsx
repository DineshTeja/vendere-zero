"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Folder,
    Plus,
    Search,
    Link,
    Cloud,
    Globe,
    Loader2,
    ExternalLink,
    FileText,
    FileIcon,
    Trash2,
    Scroll,
    ChevronLeft,
    ChevronRight,
    PuzzleIcon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CardDescription } from "@/components/ui/card";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FaGoogle, FaHubspot, FaSalesforce } from "react-icons/fa6";

// Initialize Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Type for material items
type ContentRuleValue =
    | string
    | number
    | boolean
    | string[]
    | Record<string, unknown>;

type ContentRule = {
    type: string;
    name: string;
    description: string;
    value: ContentRuleValue;
};

type MaterialItem = {
    id: string;
    user_id: string;
    material_url: string;
    content_type: "pdf" | "docx" | "url" | "gdrive" | "notion";
    summary: string;
    analysis: string;
    content_rules: ContentRule[];
    material_type: "strategy" | "branding" | "guidelines";
    tags: string[];
    image_urls: string[];
    crawled_urls: Array<{
        url: string;
        markdown_summary: string;
    }>;
    created_at: string;
    updated_at: string;
};

type URLMetadata = {
    title: string;
    description: string;
    image?: string;
    favicon?: string;
    domain: string;
};

// Add this function at the top level, before the Material component
const formatUrl = (url: string) => {
    try {
        const urlObj = new URL(url);
        return `${urlObj.hostname}${urlObj.pathname}${urlObj.search}`;
    } catch {
        return url;
    }
};

// Add type for connected tools
type ConnectedTool = {
    name: string;
    domain: string;
    status: "connected" | "disconnected";
};

export default function MaterialsComponent() {
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddFromUrlOpen, setIsAddFromUrlOpen] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [urlMetadata, setUrlMetadata] = useState<URLMetadata | null>(null);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [materialToDelete, setMaterialToDelete] = useState<MaterialItem | null>(null);
    const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null);
    const [currentCrawlPage, setCurrentCrawlPage] = useState(0);

    // Add connected tools list
    const [connectedTools] = useState<ConnectedTool[]>([
        { name: "Hubspot", domain: "hubspot.com", status: "connected" },
        { name: "Salesforce", domain: "salesforce.com", status: "connected" },
        { name: "Google Ads", domain: "ads.google.com", status: "connected" },
        { name: "Meta Ads", domain: "facebook.com", status: "connected" },
        { name: "Hootsuite", domain: "hootsuite.com", status: "connected" },
        { name: "Optimizely", domain: "optimizely.com", status: "connected" }
    ]);

    // Add function to get favicon for tools
    const getFaviconUrl = (domain: string): string => {
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    };

    // Fetch initial materials and set up real-time subscription
    useEffect(() => {
        // Initial fetch
        const fetchMaterials = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from("materials")
                    .select("*")
                    .order("created_at", { ascending: false });

                if (error) {
                    console.error("Error fetching materials:", error);
                    return;
                }

                const materialsData = data as MaterialItem[];
                setMaterials(materialsData);
                // Auto-select the first material if available
                if (materialsData.length > 0) {
                    setSelectedMaterial(materialsData[0]);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchMaterials();

        // Set up real-time subscription
        const channel = supabase.channel("materials_db_changes");

        channel
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "materials",
                },
                (payload) => {
                    console.log("Change received!", payload);
                    if (payload.eventType === "INSERT") {
                        setMaterials((prev) => [payload.new as MaterialItem, ...prev]);
                    } else if (payload.eventType === "DELETE") {
                        setMaterials((prev) =>
                            prev.filter((item) => item.id !== payload.old.id)
                        );
                    } else if (payload.eventType === "UPDATE") {
                        setMaterials((prev) =>
                            prev.map((item) =>
                                item.id === payload.new.id
                                    ? (payload.new as MaterialItem)
                                    : item
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

    const handleUrlPreview = async (url: string) => {
        if (!url) {
            setUrlMetadata(null);
            return;
        }

        try {
            setIsLoading(true);
            const response = await fetch(
                `/api/url-metadata?url=${encodeURIComponent(url)}`
            );
            if (!response.ok) {
                throw new Error("Failed to fetch metadata");
            }
            const data = await response.json();
            setUrlMetadata(data);
        } catch (error) {
            console.error("Error fetching URL metadata:", error);
            setUrlMetadata(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddMaterial = async () => {
        if (!urlInput || !urlMetadata) return;

        // Close dialog immediately
        setIsAddFromUrlOpen(false);
        setUrlInput("");
        setUrlMetadata(null);

        // Create a promise for the material processing
        const processPromise = new Promise(async (resolve, reject) => {
            try {
                const response = await fetch("/api/url-content", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ url: urlInput }),
                });

                if (!response.ok) {
                    throw new Error("Failed to process URL");
                }

                const data = await response.json();
                if (data.success) {
                    resolve(`Processed ${data.crawled_count} related pages`);
                } else {
                    reject(new Error(data.error || "Failed to add material"));
                }
            } catch (error) {
                reject(error);
            }
        });

        // Show loading toast that will update based on the promise result
        toast.promise(processPromise, {
            loading: `Processing ${urlMetadata.domain}...`,
            success: (data) => `${urlMetadata.domain} - ${data}`,
            error: (err) =>
                `${urlMetadata.domain} - ${err instanceof Error ? err.message : "Unknown error occurred"
                }`,
        });
    };

    const handleDeleteMaterial = async (material: MaterialItem) => {
        const deletePromise = new Promise(async (resolve, reject) => {
            try {
                const { error } = await supabase
                    .from("materials")
                    .delete()
                    .eq("id", material.id);

                if (error) {
                    throw error;
                }
                resolve(`Deleted ${material.material_url}`);
            } catch (error) {
                reject(error);
            }
        });

        toast.promise(deletePromise, {
            loading: `Deleting ${material.material_url}...`,
            success: () => `Successfully deleted material`,
            error: (err) =>
                `Failed to delete - ${err instanceof Error ? err.message : "Unknown error occurred"
                }`,
        });

        setMaterialToDelete(null);
    };

    return (
        <>
            <div
                className="w-full flex overflow-hidden box-border border bg-card"
                style={{
                    height: "calc(100vh - 160px)",
                    margin: 0,
                    padding: 0,
                }}
            >
                {/* Left Panel - Materials List */}
                {isLoading ? (
                    <>
                        <div className="w-[320px] h-full flex flex-col overflow-hidden box-border border-r">
                            <div className="px-4 py-3 flex items-center justify-between border-b">
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-16 bg-muted/50 animate-pulse rounded-sm" />
                                    <div className="h-5 w-6 bg-muted/50 animate-pulse rounded-sm" />
                                </div>
                                <div className="h-8 w-32 bg-muted/50 animate-pulse rounded-sm" />
                            </div>

                            <div className="border-b">
                                <div className="relative">
                                    <div className="h-9 bg-muted/50 animate-pulse" />
                                </div>
                            </div>

                            <div className="flex-1 p-4 space-y-4">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="border bg-muted/50 p-3 space-y-2 animate-pulse">
                                        <div className="h-4 w-3/4 bg-muted rounded-sm" />
                                        <div className="flex gap-2">
                                            <div className="h-5 w-20 bg-muted rounded-sm" />
                                            <div className="h-5 w-16 bg-muted rounded-sm" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Panel Loading State */}
                        <div className="flex-1 h-full flex flex-col overflow-hidden box-border p-6 space-y-6">
                            <div className="border bg-muted/50 p-4 animate-pulse">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-2">
                                        <div className="h-4 w-48 bg-muted rounded-sm" />
                                        <div className="h-3 w-32 bg-muted rounded-sm" />
                                    </div>
                                    <div className="h-8 w-28 bg-muted rounded-sm" />
                                </div>
                            </div>

                            <div className="border bg-muted/50 p-4 animate-pulse">
                                <div className="space-y-3">
                                    <div className="h-4 w-32 bg-muted rounded-sm" />
                                    <div className="flex gap-2">
                                        <div className="h-6 w-24 bg-muted rounded-sm" />
                                        <div className="h-6 w-20 bg-muted rounded-sm" />
                                    </div>
                                </div>
                            </div>

                            <div className="border bg-muted/50 p-4 animate-pulse">
                                <div className="space-y-4">
                                    <div className="h-4 w-40 bg-muted rounded-sm" />
                                    <div className="grid grid-cols-3 gap-4">
                                        {[...Array(3)].map((_, i) => (
                                            <div key={i} className="p-4 bg-muted/50 space-y-2">
                                                <div className="h-4 w-3/4 bg-muted rounded-sm" />
                                                <div className="h-4 w-full bg-muted rounded-sm" />
                                                <div className="h-4 w-5/6 bg-muted rounded-sm" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-[320px] h-full flex flex-col overflow-hidden box-border border-r">
                            <div className="px-4 py-3 flex items-center justify-between border-b">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">Materials</span>
                                    <div className="bg-[#4EBE96]/20 px-1.5 py-0.5 text-xs">
                                        {materials.length}
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm">
                                            <Plus className="h-3 w-3" /> Connect a Source
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuItem className="flex items-center">
                                            <FileText className="h-4 w-4 mr-2" />
                                            Add from PDF
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex items-center">
                                            <FileIcon className="h-4 w-4 mr-2" />
                                            Add from DOCX
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="flex items-center"
                                            onSelect={() => setIsAddFromUrlOpen(true)}
                                        >
                                            <Link className="h-4 w-4 mr-2" />
                                            Add from URL
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="flex items-center">
                                            <Cloud className="h-4 w-4 mr-2" />
                                            Add from Google Drive
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex items-center">
                                            <Globe className="h-4 w-4 mr-2" />
                                            Add from Notion
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex items-center">
                                            <FaHubspot className="h-4 w-4 mr-2" />
                                            Add from Hubspot
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex items-center">
                                            <FaGoogle className="h-4 w-4 mr-2" />
                                            Add from Google Analytics
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex items-center">
                                            <FaSalesforce className="h-4 w-4 mr-2" />
                                            Add from Salesforce
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            <div className="border-b">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search materials..."
                                        className="pl-9 h-9 rounded-none border-0 bg-muted/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Connected Tools Section */}
                            <div className="border-b py-3 px-4 bg-muted/20">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <PuzzleIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-medium text-muted-foreground">Connected Tools</span>
                                    </div>
                                    <span className="text-xs text-[#4EBE96]">{connectedTools.length} active</span>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {connectedTools.map((tool) => (
                                        <div
                                            key={tool.name}
                                            className="flex items-center gap-1.5 bg-muted/60 hover:bg-muted px-2 py-1 rounded-sm group cursor-pointer transition-colors"
                                            title={`${tool.name} (${tool.status})`}
                                        >
                                            <div className="relative w-4 h-4 flex-shrink-0">
                                                <img
                                                    src={getFaviconUrl(tool.domain)}
                                                    alt={tool.name}
                                                    className="w-full h-full object-contain"
                                                />
                                                <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-[#4EBE96] rounded-full" />
                                            </div>
                                            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{tool.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto no-scrollbar">
                                {materials.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                        <Folder className="h-12 w-12 text-muted-foreground/60 mx-auto mb-4" />
                                        <h3 className="text-lg font-medium mb-2">No materials yet</h3>
                                        <p className="text-muted-foreground text-sm max-w-md mx-auto">
                                            Start by adding your company strategy documents and materials.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col">
                                        {materials.map((material) => (
                                            <div
                                                key={material.id}
                                                className={`cursor-pointer transition-colors hover:bg-muted/50 px-4 py-3 flex items-start justify-between gap-2 border-b ${selectedMaterial?.id === material.id ? "bg-[#4EBE96]/10" : ""
                                                    }`}
                                                onClick={() => setSelectedMaterial(material)}
                                            >
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <h3 className="text-sm font-medium truncate leading-none">
                                                        {formatUrl(material.material_url)}
                                                    </h3>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="inline-flex px-2 py-0.5 bg-[#4EBE96]/20 text-xs whitespace-nowrap">
                                                            {material.material_type}
                                                        </span>
                                                        <span className="inline-flex text-xs text-muted-foreground whitespace-nowrap">
                                                            {material.crawled_urls.length} pages
                                                        </span>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMaterialToDelete(material);
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Panel - Detail View */}
                        <div className="flex-1 h-full flex flex-col overflow-hidden box-border">
                            {selectedMaterial ? (
                                <div className="h-full overflow-y-auto no-scrollbar p-6 space-y-6">
                                    {/* Material Header */}
                                    <div className="border bg-muted/50 p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-medium truncate">
                                                    {formatUrl(selectedMaterial.material_url)}
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Added {new Date(selectedMaterial.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <a
                                                href={selectedMaterial.material_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-primary"
                                            >
                                                <Button variant="outline" size="sm" className="gap-2 rounded-none">
                                                    <ExternalLink className="h-4 w-4" />
                                                    Open Source
                                                </Button>
                                            </a>
                                        </div>
                                    </div>

                                    {/* Material Type and Tags */}
                                    <div className="border bg-muted/50 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="relative text-sm font-medium px-1 bg-muted/50 border-[0.5px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] rounded-none">
                                                Type & Tags
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="px-2.5 py-1 bg-[#4EBE96]/20 text-xs">
                                                {selectedMaterial.material_type}
                                            </span>
                                            {selectedMaterial.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="px-2.5 py-1 bg-muted text-muted-foreground text-xs"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Content Rules */}
                                    <div className="border bg-muted/50 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="relative text-sm font-medium px-1 bg-muted/50 border-[0.5px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] rounded-none">
                                                Content Rules
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {selectedMaterial.content_rules.length === 0 ? (
                                                <div className="p-4 bg-muted/50 border">
                                                    <p className="text-sm text-muted-foreground">
                                                        No content rules defined
                                                    </p>
                                                </div>
                                            ) : (
                                                selectedMaterial.content_rules.map((rule, index) => (
                                                    <div key={index} className="p-4 bg-muted/50 border">
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="text-sm font-medium">{rule.name}</h4>
                                                                <span className="px-2 py-1 bg-[#4EBE96]/20 text-xs">
                                                                    {rule.type}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <p className="text-sm text-muted-foreground">
                                                                    {rule.description}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-medium">Value</span>
                                                                {Array.isArray(rule.value) ? (
                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                        {rule.value.map((item, i) => (
                                                                            <span
                                                                                key={i}
                                                                                className="px-2 py-0.5 bg-muted text-xs"
                                                                            >
                                                                                {item}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="mt-1 text-sm">
                                                                        {typeof rule.value === "object" ? (
                                                                            <pre className="p-2 bg-muted font-mono text-xs overflow-x-auto">
                                                                                {JSON.stringify(rule.value, null, 2)}
                                                                            </pre>
                                                                        ) : (
                                                                            <span className="px-2 py-0.5 bg-muted text-xs">
                                                                                {String(rule.value)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Analysis */}
                                    <div className="border bg-muted/50 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="relative text-sm font-medium px-1 bg-muted/50 border-[0.5px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] rounded-none">
                                                Analysis
                                            </span>
                                        </div>
                                        <div className="markdown">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-semibold prose-p:text-sm prose-li:text-sm prose-code:text-sm prose-pre:bg-muted prose-pre:p-4 prose-a:text-primary hover:prose-a:underline"
                                                components={{
                                                    img: () => null,
                                                }}
                                            >
                                                {selectedMaterial.analysis}
                                            </ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* Crawled URLs */}
                                    <div className="border bg-muted/50 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="relative text-sm font-medium px-1 bg-muted/50 border-[0.5px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] rounded-none">
                                                Crawled Pages</span>
                                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                <span>
                                                    {currentCrawlPage + 1} of {selectedMaterial.crawled_urls.length}
                                                </span>
                                                <div className="flex items-center gap-1 ml-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-none"
                                                        disabled={currentCrawlPage === 0}
                                                        onClick={() => setCurrentCrawlPage((prev) => prev - 1)}
                                                    >
                                                        <ChevronLeft className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-none"
                                                        disabled={currentCrawlPage === selectedMaterial.crawled_urls.length - 1}
                                                        onClick={() => setCurrentCrawlPage((prev) => prev + 1)}
                                                    >
                                                        <ChevronRight className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <a
                                                href={selectedMaterial.crawled_urls[currentCrawlPage].url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-medium hover:underline flex items-center gap-1 truncate"
                                            >
                                                {formatUrl(selectedMaterial.crawled_urls[currentCrawlPage].url)}
                                                <ExternalLink className="h-3 w-3 shrink-0" />
                                            </a>
                                            <div className="markdown">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-semibold prose-p:text-sm prose-li:text-sm prose-code:text-sm prose-pre:bg-muted prose-pre:p-4 prose-a:text-primary hover:prose-a:underline"
                                                    components={{
                                                        img: () => null,
                                                    }}
                                                >
                                                    {selectedMaterial.crawled_urls[currentCrawlPage].markdown_summary}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : isLoading ? (
                                <div className="h-full overflow-y-auto no-scrollbar p-6 space-y-6">
                                    <div className="border bg-muted/50 p-4 animate-pulse">
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-2">
                                                <div className="h-4 w-48 bg-muted rounded-sm" />
                                                <div className="h-3 w-32 bg-muted rounded-sm" />
                                            </div>
                                            <div className="h-8 w-28 bg-muted rounded-sm" />
                                        </div>
                                    </div>

                                    <div className="border bg-muted/50 p-4 animate-pulse">
                                        <div className="space-y-3">
                                            <div className="h-4 w-32 bg-muted rounded-sm" />
                                            <div className="flex gap-2">
                                                <div className="h-6 w-24 bg-muted rounded-sm" />
                                                <div className="h-6 w-20 bg-muted rounded-sm" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border bg-muted/50 p-4 animate-pulse">
                                        <div className="space-y-4">
                                            <div className="h-4 w-40 bg-muted rounded-sm" />
                                            <div className="grid grid-cols-3 gap-4">
                                                {[...Array(3)].map((_, i) => (
                                                    <div key={i} className="p-4 bg-muted/50 space-y-2">
                                                        <div className="h-4 w-3/4 bg-muted rounded-sm" />
                                                        <div className="h-4 w-full bg-muted rounded-sm" />
                                                        <div className="h-4 w-5/6 bg-muted rounded-sm" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="mb-4 p-6 bg-muted/20">
                                        <Scroll className="h-12 w-12 text-muted-foreground/60" />
                                    </div>
                                    <h3 className="text-xl font-medium mb-2">No Material Selected</h3>
                                    <p className="text-muted-foreground max-w-md">
                                        Select a material from the list on the left to view its details and content rules.
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Add Material Dialog */}
            <Dialog open={isAddFromUrlOpen} onOpenChange={setIsAddFromUrlOpen}>
                <DialogContent className="sm:max-w-[525px] rounded-none">
                    <DialogHeader>
                        <DialogTitle>Add Material from URL</DialogTitle>
                        <DialogDescription>
                            Enter a URL to add content from the web. We&apos;ll automatically fetch the title and description.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="url">URL</Label>
                            <Input
                                id="url"
                                placeholder="https://example.com/document"
                                value={urlInput}
                                onChange={(e) => {
                                    setUrlInput(e.target.value);
                                    handleUrlPreview(e.target.value);
                                }}
                                className="rounded-none"
                            />
                        </div>

                        {isLoading && (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin text-primary/70" />
                            </div>
                        )}

                        {urlMetadata && !isLoading && (
                            <div className="border bg-muted/50 p-4">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium">{urlMetadata.title}</h4>
                                        <CardDescription className="text-xs line-clamp-2">
                                            {urlMetadata.description}
                                        </CardDescription>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Globe className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">
                                                {urlMetadata.domain}
                                            </span>
                                        </div>
                                    </div>
                                    <a
                                        href={urlInput}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted-foreground hover:text-primary"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddFromUrlOpen(false)} className="rounded-none">
                            Cancel
                        </Button>
                        <Button onClick={handleAddMaterial} disabled={!urlInput || !urlMetadata} className="rounded-none">
                            Add Material
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!materialToDelete} onOpenChange={() => setMaterialToDelete(null)}>
                <AlertDialogContent className="rounded-none">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this material and all its associated content. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-none">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-none"
                            onClick={() => materialToDelete && handleDeleteMaterial(materialToDelete)}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
} 