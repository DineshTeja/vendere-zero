import React, { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  X,
  CheckCircle,
  XCircle,
  Clock,
  Tag,
  Loader2,
  List,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

// Task status type
export type TaskStatus = "pending" | "processing" | "completed" | "failed";

// Add type definitions for task metadata and result
interface TaskMetadata {
  mr_image_url?: string;
  li_name?: string;
  adName?: string;
  imageUrl?: string;
}

interface TaskResult {
  variants_generated?: number;
  total_processed?: number;
}

// Task type
export interface Task {
  id: string;
  user_id: string;
  type: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  meta: TaskMetadata;
  result?: TaskResult;
  error?: string;
}

interface TaskManagerProps {
  tasks: Task[];
  onRemoveTask: (taskId: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onTasksUpdate: (tasks: Task[]) => void;
}

// Component to handle ad image display with ad blocker consideration
const AdImage = ({
  src,
  className = "",
  size,
  alt = "Ad image",
}: {
  src?: string;
  className?: string;
  size?: number;
  alt?: string;
}) => {
  const [hasError, setHasError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [wasBlocked, setWasBlocked] = React.useState(false);

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

  // Reset error state if src changes
  React.useEffect(() => {
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
        className={`flex items-center justify-center bg-muted/40 text-muted-foreground text-xs text-center p-1 rounded-md border ${className}`}
        style={
          size
            ? { width: size, height: size }
            : { aspectRatio: "1/1", width: "100%" }
        }
      >
        {wasBlocked ? (
          <div className="flex flex-col items-center">
            <span>Ad</span>
            <span className="text-[9px] mt-1">(Blocked)</span>
          </div>
        ) : (
          <div className="h-5 w-5 opacity-40" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative border rounded-md overflow-hidden bg-background ${className}`}
      style={
        size
          ? { width: size, height: size }
          : { aspectRatio: "1/1", width: "100%" }
      }
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

const TaskManager: React.FC<TaskManagerProps> = ({
  tasks,
  onRemoveTask,
  isOpen,
  onClose,
  onTasksUpdate,
}) => {
  useEffect(() => {
    // Subscribe to task updates
    const channel = supabase
      .channel("tasks")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        async (payload) => {
          console.log("Received task update:", payload);
          // Fetch all tasks again when there's any change
          const { data: updatedTasks, error } = await supabase
            .from("tasks")
            .select("*")
            .order("created_at", { ascending: false });

          if (error) {
            console.error("Error fetching updated tasks:", error);
            return;
          }

          if (updatedTasks) {
            console.log("Updating tasks:", updatedTasks);
            onTasksUpdate(updatedTasks);
          }
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
      });

    // Cleanup subscription on unmount
    return () => {
      console.log("Cleaning up subscription");
      supabase.removeChannel(channel);
    };
  }, [onTasksUpdate]);

  // Group tasks by status
  const completedTasks = tasks.filter(
    (task) => task.status === "completed" || task.status === "failed"
  );
  const activeTasks = tasks.filter(
    (task) => task.status === "pending" || task.status === "processing"
  );

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 right-6 bg-card border shadow-lg rounded-lg w-[420px] z-50"
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">Tasks</h3>
          {activeTasks.length > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0 h-5">
              {activeTasks.length} Active
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-muted/50"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="max-h-[400px]">
        {tasks.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <div className="flex justify-center mb-3">
              <List className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm mb-1">No tasks running</p>
            <p className="text-xs text-muted-foreground/70">
              Tasks will appear here when you generate variants
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-6">
            {/* Active Tasks */}
            {activeTasks.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground px-1">
                  Active Tasks
                </h4>
                <div className="space-y-3">
                  {activeTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onRemove={onRemoveTask}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground px-1">
                  Completed Tasks
                </h4>
                <div className="space-y-3">
                  {completedTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onRemove={onRemoveTask}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
};

// TaskItem component to handle individual task rendering
const TaskItem: React.FC<{ task: Task; onRemove: (id: string) => void }> = ({
  task,
  onRemove,
}) => {
  const adVariant = task.type === "keyword_generation" ? task.meta : null;
  const imageUrl = adVariant?.mr_image_url || adVariant?.imageUrl;
  const adName = adVariant?.li_name || adVariant?.adName || "Ad preview";

  return (
    <div className="border rounded-md p-3 bg-muted/30 relative group">
      <div className="flex gap-3">
        {/* Ad Image Preview */}
        <div className="shrink-0">
          <AdImage
            src={imageUrl}
            size={48}
            className="rounded-md"
            alt={adName}
          />
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate mb-1">{adName}</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {task.status === "pending" && (
                  <>
                    <Clock className="h-3 w-3" />
                    <span>Queued</span>
                  </>
                )}
                {task.status === "processing" && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span className="text-primary">Processing</span>
                  </>
                )}
                {task.status === "completed" && (
                  <>
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-green-500">Completed</span>
                  </>
                )}
                {task.status === "failed" && (
                  <>
                    <XCircle className="h-3 w-3 text-destructive" />
                    <span className="text-destructive">Failed</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 space-y-1">
            {task.status === "completed" && task.result?.variants_generated && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3 w-3" />
                Generated {task.result.variants_generated} variants
              </p>
            )}

            {task.status === "failed" && task.error && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <XCircle className="h-3 w-3" />
                {task.error}
              </p>
            )}
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/50"
        onClick={() => onRemove(task.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

export default TaskManager;
