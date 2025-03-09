import { ChatRequestOptions, Message } from 'ai';
import { PreviewMessage } from '@/components/message';
import { useScrollToBottom } from '@/components/use-scroll-to-bottom';
import { memo, useState, useRef, useEffect } from 'react';
import equal from 'fast-deep-equal';
import Image from 'next/image';
import { Source } from '@/components/message-sources';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { cn } from '@/lib/utils';
import nlp from 'compromise';
import {
  Sparkles,
  ArrowRightCircle,
  RectangleHorizontal,
  Globe2Icon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// Helper function to extract subjects and keywords from text
const extractKeywordsFromQuery = (query: string) => {
  if (!query) return [];

  try {
    const doc = nlp(query);
    // Extract subjects, nouns, and adjectives as potential keywords
    interface NlpDocument {
      subjects(): { out(format: string): string[] };
      nouns(): { out(format: string): string[] };
      adjectives(): { out(format: string): string[] };
    }
    const nlpDoc = doc as unknown as NlpDocument;
    const subjects = nlpDoc.subjects().out('array');
    const nouns = doc.nouns().out('array');
    const adjectives = doc.adjectives().out('array');

    // Combine and remove duplicates
    const allTerms = [...subjects, ...nouns, ...adjectives];
    const uniqueTerms = Array.from(new Set(allTerms));

    // Remove very short terms and return
    return uniqueTerms.filter(term => term.length > 2);
  } catch (error) {
    console.error('Error extracting keywords:', error);
    return [];
  }
};

export function ThinkingMessage({ thinking, query }: { thinking?: string, query?: string }) {
  const [expandedSteps, setExpandedSteps] = useState<{ [key: number]: boolean }>({});
  const [currentStep, setCurrentStep] = useState(0);
  const collapsedContentRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Keywords from query - will be used in steps description
  const extractedKeywords = query ? extractKeywordsFromQuery(query) : [];
  const keywords = extractedKeywords.length > 0 ?
    extractedKeywords :
    ['product metrics', 'market share', 'competitors', 'performance data'];

  // Define thinking steps - simpler with fewer icons
  const thinkingSteps = [
    {
      name: "Searching knowledge base",
      sources: ["Hubspot", "Salesforce", "Notion"]
    },
    {
      name: `Analyzing ${keywords[0] || 'market'} data`,
      sources: ["Google Analytics", "Tableau"]
    },
    {
      name: `Researching ${keywords[1] || 'competitors'}`,
      sources: ["Industry Reports", "Company Wiki", "Statista"]
    },
    {
      name: "Synthesizing information",
      sources: []
    }
  ];

  // Add the final step when thinking content is available
  const allSteps = thinking && thinking.trim() !== ''
    ? [...thinkingSteps, {
      name: "Company Context Model",
      sources: []
    }]
    : thinkingSteps;

  const hasThinkingContent = thinking && thinking.trim() !== '';
  const finalStepIndex = allSteps.length - 1;

  // Toggle a specific step's expanded state
  const toggleStep = (index: number) => {
    setExpandedSteps(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Toggle the collapsed state of the entire component
  const toggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Auto-scroll and auto-advance steps for animation effect
  useEffect(() => {
    // Don't run animations when collapsed
    if (isCollapsed) return;

    // Auto-scroll when thinking content changes
    if (thinking && collapsedContentRef.current) {
      collapsedContentRef.current.scrollTop = collapsedContentRef.current.scrollHeight;
    }

    // If we have thinking content, expand the final step only on initial load
    if (hasThinkingContent && !expandedSteps[finalStepIndex] && Object.keys(expandedSteps).length === 0) {
      setExpandedSteps(prev => ({
        ...prev,
        [finalStepIndex]: true
      }));
      return;
    }

    // Auto-advance steps for animation when in loading state
    if (!hasThinkingContent) {
      const timer = setTimeout(() => {
        if (currentStep < thinkingSteps.length - 1) {
          setCurrentStep(prev => prev + 1);
        } else {
          // Loop back to first step for continuous animation
          setCurrentStep(0);
        }
      }, 3000); // Advance every 3 seconds

      return () => clearTimeout(timer);
    }
  }, [thinking, currentStep, thinkingSteps.length, expandedSteps, finalStepIndex, hasThinkingContent, isCollapsed]);

  return (
    <div className="w-full px-5">
      <LayoutGroup id="thinking-message">
        <motion.div
          className="rounded-none border border-border/30 bg-background/90 shadow-sm overflow-hidden"
          layout="position"
          layoutId="container"
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            mass: 0.8
          }}
        >
          {/* Header */}
          <motion.div
            className={cn(
              "flex items-center justify-between py-2 px-4",
              isCollapsed ? "cursor-pointer hover:bg-muted/5" : "",
              isCollapsed ? "border-b-0" : "border-b border-border/30"
            )}
            onClick={isCollapsed ? toggleCollapsed : undefined}
            layout="position"
            layoutId="header"
          >
            <motion.div
              className="text-sm font-medium text-muted-foreground/90"
              layout="position"
              layoutId="title"
            >
              Reasoning Process
            </motion.div>

            <motion.div className="flex items-center gap-2" layout="position" layoutId="controls">
              <AnimatePresence mode="wait">
                {isCollapsed && (
                  <motion.div
                    className="flex items-center"
                    initial={{ opacity: 0, width: 0, marginRight: 0, overflow: 'hidden' }}
                    animate={{
                      opacity: 1,
                      width: 'auto',
                      marginRight: 4,
                      transition: {
                        width: {
                          type: "spring",
                          stiffness: 400,
                          damping: 40,
                          mass: 0.6,
                          duration: 0.5
                        },
                        opacity: {
                          type: "tween",
                          duration: 0.2,
                          delay: 0.1,
                          ease: "easeOut"
                        }
                      }
                    }}
                    exit={{
                      opacity: 0,
                      width: 0,
                      marginRight: 0,
                      transition: {
                        width: {
                          type: "spring",
                          stiffness: 400,
                          damping: 40,
                          mass: 0.6,
                          duration: 0.4,
                          delay: 0.05
                        },
                        opacity: {
                          type: "tween",
                          duration: 0.15
                        }
                      }
                    }}
                  >
                    <motion.span
                      className="text-xs text-muted-foreground/70 whitespace-nowrap"
                      layout
                    >
                      {allSteps.length} steps
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground/70 hover:text-muted-foreground/90 hover:bg-background/20"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed();
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isCollapsed ? (
                    <motion.div
                      key="show-details"
                      className="flex items-center gap-1.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <span>Show Details</span>
                      <ChevronDown className="h-3 w-3" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="hide-details"
                      className="flex items-center gap-1.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <span>Hide Details</span>
                      <ChevronUp className="h-3 w-3" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>
          </motion.div>

          {/* Content area with staggered animation */}
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.div
                className="overflow-hidden"
                initial={{ height: 0 }}
                animate={{
                  height: "auto",
                  transition: {
                    duration: 0.4,
                    ease: [0.25, 1, 0.5, 1] // Custom easing curve for smoother expansion
                  }
                }}
                exit={{
                  height: 0,
                  transition: {
                    duration: 0.3,
                    ease: [0.5, 0, 0.75, 0]
                  }
                }}
              >
                <motion.div
                  className="space-y-1.5 p-4 pt-2 ml-1"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: {
                      delay: 0.1,
                      duration: 0.3
                    }
                  }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: 0.2
                    }
                  }}
                >
                  {allSteps.map((step, index) => {
                    const isActive = index === currentStep && !hasThinkingContent;
                    const isCompleted = hasThinkingContent || (!hasThinkingContent && index < currentStep);
                    const isExpanded = expandedSteps[index];
                    const isLastStep = index === allSteps.length - 1;

                    return (
                      <div key={index} className="relative">
                        {/* Step container - boxed with subtle border */}
                        <div
                          className={cn(
                            "flex items-start transition-all duration-200 relative",
                            !isCompleted && !isActive ? "opacity-40" : "opacity-100",
                            isLastStep && hasThinkingContent ? "mt-1" : ""
                          )}
                        >
                          {/* Step indicator - more subtle and perfectly aligned */}
                          <div className="z-10 pt-[10px] self-start flex justify-center" style={{ width: '16px' }}>
                            <div className={cn(
                              "h-2 w-2 rounded-full transition-colors",
                              isCompleted
                                ? "bg-primary/40"
                                : isActive
                                  ? "bg-primary/30"
                                  : "bg-muted/40"
                            )} />
                          </div>

                          {/* Vertical connector to next step - aligned to center of circles */}
                          {!isLastStep && (
                            <div className="absolute left-2 top-[19px] bottom-0 w-px bg-primary/20" style={{ left: '8px', height: 'calc(100% - 11px)' }} />
                          )}

                          {/* Step content in a sleek box */}
                          <div className={cn(
                            "flex-1 ml-3 border border-border/30 rounded-sm p-2 bg-muted/5",
                            isActive && "bg-muted/10",
                            isCompleted && isLastStep && "shadow-sm"
                          )}>
                            {/* Step header with inline source tags */}
                            <div
                              className={cn(
                                "flex items-center justify-between",
                                isCompleted ? "cursor-pointer" : ""
                              )}
                              onClick={() => isCompleted && toggleStep(index)}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="text-xs font-medium text-muted-foreground/90">
                                  {step.name}
                                </div>

                                {/* Source tags in horizontal row - shown for active and completed steps */}
                                {(isActive || isCompleted) && step.sources.length > 0 && (
                                  <div className="flex flex-wrap gap-1 ml-1">
                                    {step.sources.map((source, sourceIdx) => (
                                      <span
                                        key={sourceIdx}
                                        className={cn(
                                          "px-1.5 py-0.5 text-[9px] rounded-sm border",
                                          isCompleted
                                            ? "bg-background/60 text-muted-foreground/50 border-border/30"
                                            : "bg-muted/30 text-muted-foreground/70 border-muted/40"
                                        )}
                                      >
                                        {source}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Minimal expand/collapse button for completed steps */}
                              {isCompleted && isLastStep && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground/90 hover:bg-background/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleStep(index);
                                  }}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                            </div>

                            {/* Step content - different for final step (reasoning) vs. normal steps */}
                            {index === finalStepIndex && hasThinkingContent ? (
                              <AnimatePresence initial={false} mode="wait">
                                {isExpanded ? (
                                  <motion.div
                                    key="reasoning-content-expanded"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{
                                      height: {
                                        duration: 0.3,
                                        ease: [0.25, 1, 0.5, 1]
                                      },
                                      opacity: {
                                        duration: 0.2,
                                        delay: 0.1
                                      }
                                    }}
                                    className="overflow-hidden"
                                  >
                                    <div className="pt-2 pb-1 text-xs text-muted-foreground/90 leading-relaxed">
                                      {thinking.split('\n\n').map((paragraph, i) => (
                                        <p key={i} className="whitespace-pre-wrap mb-2">
                                          {paragraph.trim()}
                                        </p>
                                      ))}
                                    </div>
                                  </motion.div>
                                ) : (
                                  <motion.div
                                    key="reasoning-content-collapsed"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    {/* Scrollable preview in collapsed state */}
                                    <div
                                      ref={collapsedContentRef}
                                      className="text-xs text-muted-foreground/90 whitespace-pre-wrap overflow-y-auto max-h-[80px] pr-1 no-scrollbar mt-1 border-l border-primary/20 pl-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleStep(index);
                                      }}
                                    >
                                      {thinking.split('\n\n').map((paragraph, i) => (
                                        <p key={i} className="mb-2">
                                          {paragraph.trim()}
                                        </p>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </div>
  );
}

// New component for suggested tasks
function SuggestedTasks({ tasks }: { tasks: Message['suggestedTasks'] }) {
  if (!tasks || tasks.length === 0) return null;

  const displayTasks = tasks.slice(0, 3);

  const getTaskIcon = (taskType: string) => {
    switch (taskType) {
      case 'variant_generation':
        return <RectangleHorizontal className="h-4 w-4 text-white/50" />;
      case 'suggested_query':
        return <Globe2Icon className="h-4 w-4 text-white/50" />;
      default:
        return <Sparkles className="h-4 w-4 text-white/50" />;
    }
  };

  const handleTaskClick = (task: typeof tasks[0]) => {
    console.log('Task clicked:', task);

    if (task.task_type === 'suggested_query') {
      alert(`Would execute query: ${task.input_data.query}`);
    } else if (task.task_type === 'variant_generation') {
      alert(`Would generate variants with ${task.input_data.keywords.length} keywords for ${task.input_data.target_markets.length} markets`);
    }
  };

  return (
    <motion.div
      className="w-full md:w-[220px] flex flex-col gap-3 bg-background/20 backdrop-blur-sm p-2 rounded-lg border border-white/[0.08]"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="text-xs uppercase tracking-wider text-white/40 font-medium px-0.5">
        Suggested Tasks
      </div>
      <div className="flex flex-col gap-2">
        {displayTasks.map((task, index) => (
          <motion.div
            key={index}
            className="group relative"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <div
              onClick={() => handleTaskClick(task)}
              className="p-2.5 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] rounded-md transition-all duration-200 cursor-pointer overflow-hidden"
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 p-1.5 bg-white/[0.05] rounded-md">
                  {getTaskIcon(task.task_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white/90 truncate">
                      {task.title}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-white/[0.08] hover:text-white/90"
                        >
                          <ArrowRightCircle className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        align="start"
                        className="max-w-[250px] text-white/70 bg-background/90 backdrop-blur-sm border-white/[0.08]"
                      >
                        <p className="text-xs">{task.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="mt-1 text-xs text-white/50 line-clamp-2">
                    {task.description}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="text-[11px] text-white/40">
                      {task.task_type === 'variant_generation'
                        ? `${task.input_data.keywords.length} keywords`
                        : task.task_type === 'suggested_query'
                          ? (task.input_data.deep_research ? 'Deep research' : 'Quick answer')
                          : ''}
                    </div>
                    <div className="h-1 w-12 bg-white/[0.05] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#B1E116]/30"
                        style={{ width: `${task.relevance_score * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function ImageGrid({ sources }: { sources: Source[], citations?: string[] }) {
  // Extract image URLs from sources
  const imageUrls = sources
    .map(source => source.extra_info?.image_url)
    .filter((url): url is string => !!url);

  // We don't include citation images here since they don't have preview images
  // This could be expanded in the future if needed

  if (imageUrls.length === 0) return null;

  return (
    <motion.div
      className="w-[200px] grid grid-cols-2 gap-2 bg-background/30 p-2 rounded-none border border-border/30"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      {imageUrls.map((url, index) => (
        <motion.div
          key={index}
          className="aspect-square relative rounded-none overflow-hidden border border-border/20 cursor-pointer"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <Image
            src={url}
            alt="Source image"
            fill
            className="object-cover transition-transform duration-200 hover:scale-110"
          />
        </motion.div>
      ))}
    </motion.div>
  );
}

function MessageWithImages({ message, isLoading, setMessages, reload, isReadonly }: {
  message: Message;
  isLoading: boolean;
  setMessages: MessagesProps['setMessages'];
  reload: MessagesProps['reload'];
  isReadonly: boolean;
}) {
  const hasVisualContent =
    message.role === 'assistant' &&
    ((message.sources && message.sources.length > 0) ||
      (message.citations && message.citations.length > 0));

  const hasSuggestedTasks =
    message.role === 'assistant' &&
    message.suggestedTasks &&
    message.suggestedTasks.length > 0;

  // Get the user's query from the previous message
  const findPreviousUserQuery = (): string | undefined => {
    // If this is an assistant message, try to find the most recent user message
    if (message.role === 'assistant') {
      const messagesArray = Array.isArray(setMessages) ? setMessages : [];
      const index = messagesArray.findIndex(msg => msg.id === message.id);
      if (index > 0) {
        // Look backward for the most recent user message
        for (let i = index - 1; i >= 0; i--) {
          if (messagesArray[i].role === 'user') {
            return messagesArray[i].content;
          }
        }
      }
    }
    return undefined;
  };

  const previousQuery = findPreviousUserQuery();

  // Show thinking for assistant messages that are still loading or have thinking content
  const hasThinking = message.role === 'assistant' &&
    (isLoading || (message as { thinking?: string }).thinking !== undefined);

  return (
    <div className="flex items-start justify-center w-full">
      <div className="w-full max-w-[1200px] relative">
        {/* Grid layout with responsive adjustments */}
        {/* On mobile, only show the center column */}
        {/* On tablet+, show all three columns */}
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_200px] items-start">
          {/* Left column - Suggested Tasks - hidden on mobile */}
          <div className="hidden md:flex justify-end pr-3">
            {hasSuggestedTasks && (
              <SuggestedTasks tasks={message.suggestedTasks} />
            )}
          </div>

          {/* Center column - Message Content - Always centered */}
          <div className={cn(
            "mx-auto w-full max-w-[800px] flex flex-col gap-4",
          )}>
            {hasThinking && <ThinkingMessage thinking={(message as { thinking?: string }).thinking} query={previousQuery} />}
            <PreviewMessage
              message={message}
              isLoading={isLoading}
              setMessages={setMessages}
              reload={reload}
              isReadonly={isReadonly}
            />
          </div>

          {/* Right column - Image Grid - hidden on mobile */}
          <div className="hidden md:flex justify-start pl-6">
            {hasVisualContent && (
              <ImageGrid
                sources={message.sources || []}
                citations={message.citations}
              />
            )}
          </div>
        </div>

        {/* Mobile-only section for thinking content, suggested tasks and image grid */}
        <div className="flex md:hidden flex-col items-center mt-4 gap-4">
          {hasThinking && (
            <div className="w-full max-w-[400px]">
              <ThinkingMessage thinking={(message as { thinking?: string }).thinking} query={previousQuery} />
            </div>
          )}
          {hasSuggestedTasks && (
            <div className="w-full max-w-[400px]">
              <SuggestedTasks tasks={message.suggestedTasks} />
            </div>
          )}
          {hasVisualContent && (
            <div className="w-full max-w-[400px]">
              <ImageGrid
                sources={message.sources || []}
                citations={message.citations}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MessagesProps {
  isLoading: boolean;
  messages: Array<Message>;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  isArtifactVisible: boolean;
}

function PureMessages({
  isLoading,
  messages,
  setMessages,
  reload,
  isReadonly,
}: MessagesProps) {
  const [messagesContainerRef] = useScrollToBottom<HTMLDivElement>();

  // Find the most recent user query if a thinking message is about to be shown
  const getCurrentUserQuery = (): string | undefined => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
      return messages[messages.length - 1].content;
    }
    return undefined;
  };

  const currentQuery = getCurrentUserQuery();

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col gap-6 h-full overflow-y-auto py-4 px-4 no-scrollbar"
    >
      {messages.map((message, index) => (
        <MessageWithImages
          key={message.id}
          message={message}
          isLoading={isLoading && messages.length - 1 === index}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {isLoading &&
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' && (
          <div className="flex items-start justify-center w-full">
            <div className="w-full max-w-[1200px] relative">
              <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_200px] items-start">
                <div className="hidden md:flex justify-end pr-6">
                  {/* Empty space for suggested tasks on thinking message */}
                </div>
                <div className="mx-auto w-full max-w-[800px]">
                  <ThinkingMessage query={currentQuery} />
                </div>
                <div className="hidden md:flex justify-start pl-6">
                  {/* Empty space for image grid on thinking message */}
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) return true;

  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLoading && nextProps.isLoading) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;

  return true;
});
