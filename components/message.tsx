'use client';

import type { ChatRequestOptions, Message } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';

import { DocumentToolCall, DocumentToolResult } from '@/components/document';
import {
  PencilEditIcon,
} from '@/components/icons';
import { Markdown } from '@/components/markdown';
import { PreviewAttachment } from '@/components/preview-attachment';
import { Weather } from '@/components/weather';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from '@/components/message-editor';
import { DocumentPreview } from '@/components/document-preview';
import { MessageReasoning } from '@/components/message-reasoning';
import { Ratio } from 'lucide-react';
import { MessageSources, Source } from '@/components/message-sources';

// Extend the Message type to include sources
declare module 'ai' {
  interface Message {
    sources?: Source[];
    citations?: string[];
    suggestedTasks?: Array<{
      task_type: string;
      title: string;
      description: string;
      input_data: Record<string, unknown>;
      relevance_score: number;
    }>;
  }
}

const PurePreviewMessage = ({
  message,
  isLoading,
  setMessages,
  reload,
  isReadonly,
  onFeaturedImagesChange,
  featuredImages = [],
}: {
  message: Message;
  isLoading: boolean;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  onFeaturedImagesChange?: (imageUrls: string[]) => void;
  featuredImages?: string[];
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  return (
    <AnimatePresence>
      <motion.div
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full',
            {
              'w-full': mode === 'edit',
            },
          )}
        >
          {/* {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-none justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <Image src="/favicon.ico" alt="Vendere Logo" width={14} height={14} className="rounded-sm" />
              </div>
            </div>
          )} */}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments && (
              <div className="flex flex-row justify-end gap-2">
                {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}

            {message.reasoning && (
              <MessageReasoning
                isLoading={isLoading}
                reasoning={message.reasoning}
              />
            )}

            {(message.content || message.reasoning) && mode === 'view' && (
              <div className="flex flex-row gap-2 items-start w-full">
                {message.role === 'user' && !isReadonly && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className="px-2 h-fit rounded-none text-muted-foreground opacity-0 group-hover/message:opacity-100 absolute -left-8"
                        onClick={() => {
                          setMode('edit');
                        }}
                      >
                        <PencilEditIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit message</TooltipContent>
                  </Tooltip>
                )}

                {message.role === 'assistant' ? (
                  <div className="flex flex-col w-full">

                    {/* Display sources if available */}
                    {(message.sources && message.sources.length > 0) || (message.citations && message.citations.length > 0) ? (
                      <MessageSources
                        sources={message.sources || []}
                        citations={message.citations || []}
                        onFeaturedImagesChange={onFeaturedImagesChange}
                        featuredImages={featuredImages}
                      />
                    ) : null}

                    <div className="flex items-center mb-2">
                      {/* <div className="flex items-center justify-center w-8 h-8 transition-all duration-300 ease-in-out">
                        <Ratio className="h-6 w-6 text-white/70 p-1 rounded-md transition-all duration-300 ease-in-out" />
                      </div> */}
                      <span className="font-medium flex items-center gap-2 text-md text-white/70">
                        <Ratio className="h-4 w-4 text-white/70 rounded-md transition-all duration-300 ease-in-out" />
                        Answer
                      </span>
                    </div>
                    <div className="text-muted-foreground markdown-content">
                      <Markdown className="text-white/90">{message.content as string}</Markdown>
                    </div>

                    {/* Display sources if available
                    {message.sources && message.sources.length > 0 && (
                      <MessageSources sources={message.sources} />
                    )} */}
                  </div>
                ) : (
                  <div
                    className={cn('flex flex-col w-full', {
                      'text-[#B1E116]/70 bg-transparent border-b border-border text-xl px-0 py-3 rounded-none font-normal':
                        message.role === 'user',
                    })}
                  >
                    <Markdown className={message.role === 'user' ? 'text-[#B1E116]/70' : 'text-white/90'}>{message.content as string}</Markdown>
                  </div>
                )}
              </div>
            )}

            {message.content && mode === 'edit' && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={message.id}
                  message={message}
                  setMode={setMode}
                  setMessages={setMessages}
                  reload={reload}
                />
              </div>
            )}

            {message.toolInvocations && message.toolInvocations.length > 0 && (
              <div className="flex flex-col gap-4">
                {message.toolInvocations.map((toolInvocation) => {
                  const { toolName, toolCallId, state, args } = toolInvocation;

                  if (state === 'result') {
                    const { result } = toolInvocation;

                    return (
                      <div key={toolCallId}>
                        {toolName === 'getWeather' ? (
                          <Weather weatherAtLocation={result} />
                        ) : toolName === 'createDocument' ? (
                          <DocumentPreview
                            isReadonly={isReadonly}
                            result={result}
                          />
                        ) : toolName === 'updateDocument' ? (
                          <DocumentToolResult
                            type="update"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : toolName === 'requestSuggestions' ? (
                          <DocumentToolResult
                            type="request-suggestions"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : (
                          <pre>{JSON.stringify(result, null, 2)}</pre>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'getWeather' ? (
                        <Weather />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview isReadonly={isReadonly} args={args} />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolCall
                          type="update"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolCall
                          type="request-suggestions"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(PurePreviewMessage, (prevProps, nextProps) => {
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (!equal(prevProps.message, nextProps.message)) return false;
  return true;
});

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div className="flex flex-col w-full">
        <div className="flex items-center mb-2">
          <span className="font-medium flex items-center gap-2 text-md text-white/70">
            <Ratio className="h-4 w-4 text-white/70 rounded-md animate-pulse" />
            Thinking
          </span>
        </div>
      </div>
    </motion.div>
  );
};
