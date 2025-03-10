import { useState } from "react";
import { Settings } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import React from "react";

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

export default function AdImage({
    src,
    className = "",
    size,
    alt = "Ad image",
    isSelected = false,
    onClick,
    preserveAspectRatio = false,
    new_headlines = [],
    handleBoundingBoxClick = () => { },
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
}): React.ReactElement {
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
                className={`flex items-center justify-center bg-muted/40 text-muted-foreground text-xs text-center p-1 rounded-md border ${className} ${isSelected ? "ring-2 ring-primary" : ""
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
            className={`relative border rounded-md overflow-hidden bg-background cursor-pointer transition-all hover:opacity-90 ${isSelected ? "ring-2 ring-primary" : ""
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
}