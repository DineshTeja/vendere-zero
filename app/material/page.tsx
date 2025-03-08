"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
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
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export default function Material() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddFromUrlOpen, setIsAddFromUrlOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [urlMetadata, setUrlMetadata] = useState<URLMetadata | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [materialToDelete, setMaterialToDelete] = useState<MaterialItem | null>(
    null
  );
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(
    null
  );
  const [currentCrawlPage, setCurrentCrawlPage] = useState(0);

  // Fetch initial materials and set up real-time subscription
  useEffect(() => {
    // Initial fetch
    const fetchMaterials = async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching materials:", error);
        return;
      }

      setMaterials(data as MaterialItem[]);
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
        `${urlMetadata.domain} - ${
          err instanceof Error ? err.message : "Unknown error occurred"
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
        `Failed to delete - ${
          err instanceof Error ? err.message : "Unknown error occurred"
        }`,
    });

    setMaterialToDelete(null);
  };

  return (
    <div className="bg-background overflow-hidden overflow-y-clip overscroll-y-none">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Company Materials</h1>
          <p className="text-muted-foreground text-sm">
            Access and manage company strategy and branding materials
          </p>
        </div>

        <div className="border rounded-lg">
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
              {/* Left Panel - Materials List */}
              <div className="w-80 h-full border-r flex flex-col overflow-hidden box-border">
                {/* Header */}
                <div
                  className="px-4 py-4 bg-card shrink-0 box-border"
                  style={{ height: "73px" }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">Materials</CardTitle>
                      <CardDescription>
                        {materials.length > 0
                          ? `${materials.length} materials available`
                          : "Add your first material"}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="h-8 w-8"
                          variant="outline"
                          size="icon"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {/* Local file uploads */}
                        <DropdownMenuItem className="flex items-center">
                          <FileText className="h-4 w-4 mr-2" />
                          Add from PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center">
                          <FileIcon className="h-4 w-4 mr-2" />
                          Add from DOCX
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {/* Web imports */}
                        <DropdownMenuItem
                          className="flex items-center"
                          onSelect={() => setIsAddFromUrlOpen(true)}
                        >
                          <Link className="h-4 w-4 mr-2" />
                          Add from URL
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {/* External services */}
                        <DropdownMenuItem className="flex items-center">
                          <Cloud className="h-4 w-4 mr-2" />
                          Add from Google Drive
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center">
                          <Globe className="h-4 w-4 mr-2" />
                          Add from Notion
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="px-3 py-2 border-y bg-muted/40">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search materials..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    {materials.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <Folder className="h-12 w-12 text-muted-foreground/60 mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          No materials yet
                        </h3>
                        <p className="text-muted-foreground text-sm max-w-md mx-auto">
                          Start by adding your company strategy documents and
                          materials.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 p-2">
                        {materials.map((material) => (
                          <Card
                            key={material.id}
                            className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                              selectedMaterial?.id === material.id
                                ? "bg-primary/10"
                                : ""
                            }`}
                            onClick={() => setSelectedMaterial(material)}
                          >
                            <div className="p-3 flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0 space-y-1">
                                <h3 className="text-sm font-medium truncate leading-none">
                                  {formatUrl(material.material_url)}
                                </h3>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs whitespace-nowrap">
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
                          </Card>
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
                  {selectedMaterial ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl truncate">
                          {formatUrl(selectedMaterial.material_url)}
                        </CardTitle>
                        <CardDescription>
                          Added{" "}
                          {new Date(
                            selectedMaterial.created_at
                          ).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={selectedMaterial.material_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <Button variant="outline" size="sm" className="gap-2">
                            <ExternalLink className="h-4 w-4" />
                            Open Source
                          </Button>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <CardTitle className="text-xl">Material Details</CardTitle>
                  )}
                </div>

                <Separator className="shrink-0" />

                <div className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    {selectedMaterial ? (
                      <div className="p-6 space-y-6">
                        {/* Material Type and Tags */}
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium">Type & Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs">
                              {selectedMaterial.material_type}
                            </span>
                            {selectedMaterial.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Content Rules */}
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium">Content Rules</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selectedMaterial.content_rules.length === 0 ? (
                              <Card className="p-4">
                                <p className="text-sm text-muted-foreground">
                                  No content rules defined
                                </p>
                              </Card>
                            ) : (
                              selectedMaterial.content_rules.map(
                                (rule, index) => (
                                  <Card key={index} className="p-4">
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium">
                                          {rule.name}
                                        </h4>
                                        <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                                          {rule.type}
                                        </span>
                                      </div>
                                      <div>
                                        <p className="text-sm text-muted-foreground">
                                          {rule.description}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium">
                                          Value
                                        </span>
                                        {Array.isArray(rule.value) ? (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {rule.value.map((item, i) => (
                                              <span
                                                key={i}
                                                className="px-2 py-0.5 rounded-full bg-muted text-xs"
                                              >
                                                {item}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="mt-1 text-sm">
                                            {typeof rule.value === "object" ? (
                                              <pre className="p-2 rounded-lg bg-muted font-mono text-xs overflow-x-auto">
                                                {JSON.stringify(
                                                  rule.value,
                                                  null,
                                                  2
                                                )}
                                              </pre>
                                            ) : (
                                              <span className="px-2 py-0.5 rounded-md bg-muted text-xs">
                                                {String(rule.value)}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </Card>
                                )
                              )
                            )}
                          </div>
                        </div>

                        {/* Analysis */}
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium">Analysis</h3>
                          <Card className="p-4">
                            <div className="markdown">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-semibold prose-p:text-sm prose-li:text-sm prose-code:text-sm prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-a:text-primary hover:prose-a:underline"
                                components={{
                                  img: () => null,
                                }}
                              >
                                {selectedMaterial.analysis}
                              </ReactMarkdown>
                            </div>
                          </Card>
                        </div>

                        {/* Crawled URLs */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium">
                              Crawled Pages
                            </h3>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <span>
                                {currentCrawlPage + 1} of{" "}
                                {selectedMaterial.crawled_urls.length}
                              </span>
                              <div className="flex items-center gap-1 ml-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={currentCrawlPage === 0}
                                  onClick={() =>
                                    setCurrentCrawlPage((prev) => prev - 1)
                                  }
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={
                                    currentCrawlPage ===
                                    selectedMaterial.crawled_urls.length - 1
                                  }
                                  onClick={() =>
                                    setCurrentCrawlPage((prev) => prev + 1)
                                  }
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          <Card>
                            <div className="p-4 border-b">
                              <div className="flex items-center justify-between">
                                <a
                                  href={
                                    selectedMaterial.crawled_urls[
                                      currentCrawlPage
                                    ].url
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium hover:underline flex items-center gap-1 truncate"
                                >
                                  {formatUrl(
                                    selectedMaterial.crawled_urls[
                                      currentCrawlPage
                                    ].url
                                  )}
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              </div>
                            </div>
                            <div className="p-4">
                              <div className="markdown">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  className="prose dark:prose-invert prose-sm w-full max-w-none prose-headings:font-semibold prose-p:text-sm prose-li:text-sm prose-code:text-sm prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-a:text-primary hover:prose-a:underline"
                                  components={{
                                    img: () => null,
                                  }}
                                >
                                  {
                                    selectedMaterial.crawled_urls[
                                      currentCrawlPage
                                    ].markdown_summary
                                  }
                                </ReactMarkdown>
                              </div>
                            </div>
                          </Card>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mb-4 p-6 bg-muted/20 rounded-full">
                          <Scroll className="h-12 w-12 text-muted-foreground/60" />
                        </div>
                        <h3 className="text-xl font-medium mb-2">
                          No Material Selected
                        </h3>
                        <p className="text-muted-foreground max-w-md">
                          Select a material from the list on the left to view
                          its details and content rules.
                        </p>
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <Dialog open={isAddFromUrlOpen} onOpenChange={setIsAddFromUrlOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Add Material from URL</DialogTitle>
            <DialogDescription>
              Enter a URL to add content from the web. We&apos;ll automatically
              fetch the title and description.
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
              />
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary/70" />
              </div>
            )}

            {urlMetadata && !isLoading && (
              <Card className="p-4">
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
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddFromUrlOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMaterial}
              disabled={!urlInput || !urlMetadata}
            >
              Add Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!materialToDelete}
        onOpenChange={() => setMaterialToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this material and all its associated
              content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                materialToDelete && handleDeleteMaterial(materialToDelete)
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
