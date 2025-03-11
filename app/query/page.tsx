'use client';

import { useState } from 'react';
import { MultimodalInput } from '@/components/multimodal-input';
import { Attachment, Message as BaseMessage, CreateMessage, ChatRequestOptions } from 'ai';
import { Messages } from '@/components/messages';
import { Source } from '@/components/message-sources';

// Extend the Message interface to include thinking content
interface Message extends BaseMessage {
    sources?: Source[];
    citations?: string[];
    suggestedTasks?: Array<{
        title: string;
        description: string;
        task_type: string;
        input_data: any;
        relevance_score: number;
    }>;
    thinking?: string;
}

// Extend ChatRequestOptions to include detailLevel
interface CustomChatRequestOptions extends ChatRequestOptions {
    detailLevel?: number;
}

export default function QueryPage() {
    const [messages, setMessages] = useState<Array<Message>>([]);
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [detailLevel, setDetailLevel] = useState(50);
    const [deepResearch, setDeepResearch] = useState(false);

    const handleSubmit = async (event?: { preventDefault?: () => void }, options?: CustomChatRequestOptions) => {
        event?.preventDefault?.();

        if (!input.trim()) {
            return;
        }

        setIsLoading(true);
        setHasError(false);

        try {
            // Add user message
            const userMessage: Message = {
                id: Date.now().toString(),
                role: 'user',
                content: input,
                createdAt: new Date()
            };
            setMessages(prev => [...prev, userMessage]);
            setInput('');

            // Make API call
            const response = await fetch('/api/knowledge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: input,
                    messages: messages,
                    detailLevel: options?.detailLevel !== undefined ? options.detailLevel : detailLevel,
                    deepResearch: deepResearch,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            const data = await response.json();
            if (!data || !data.content) {
                throw new Error('Invalid response format');
            }

            // Include sources and citations in the message if available
            const assistantMessage: Message = {
                id: data.id || Date.now().toString(),
                role: 'assistant',
                content: data.content,
                createdAt: new Date(data.createdAt) || new Date(),
                sources: data.sources as Source[],
                citations: data.citations || [],
                suggestedTasks: data.suggestedTasks || []
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Error in chat:', error);
            setHasError(true);
            const errorMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: 'Sorry, there was an error processing your request. Please try again.',
                createdAt: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const reload = async () => {
        return null;
    };

    const append = async (
        message: Message | CreateMessage,
        chatRequestOptions?: CustomChatRequestOptions
    ) => {
        try {
            // Add user message to the chat
            const userMessage: Message = {
                id: Date.now().toString(),
                role: 'user',
                content: message.content,
                createdAt: new Date()
            };
            setMessages(prev => [...prev, userMessage]);

            setIsLoading(true);
            setHasError(false);

            // Create a placeholder message for the assistant's response
            const assistantMessageId = (Date.now() + 1).toString();
            const assistantMessage: Message = {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                createdAt: new Date(),
                sources: [],
                citations: [],
                suggestedTasks: [],
                thinking: '' // Add a field to hold thinking content
            };

            // Add empty placeholder message immediately so user sees a response is coming
            setMessages(prev => [...prev, assistantMessage]);

            // Start with loading state by making isLoading true
            setIsLoading(true);

            // Make API call with streaming
            const response = await fetch('/api/knowledge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: message.content,
                    messages: messages,
                    detailLevel: chatRequestOptions?.detailLevel !== undefined ? chatRequestOptions.detailLevel : detailLevel,
                    deepResearch: deepResearch,
                    stream: true,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to get response: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('ReadableStream not supported');
            }

            // Get a reader from the response body stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let inThinkingBlock = false;
            let thinkingContent = '';
            let regularContent = '';

            // Read the stream
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                // Decode the chunk
                const chunk = decoder.decode(value);

                // Process each line in the chunk (SSE format sends one event per line)
                const lines = chunk.split('\n');
                for (const line of lines) {
                    // Look for lines that start with "data: "
                    if (line.startsWith('data: ')) {
                        const content = line.slice(6); // Remove "data: " prefix

                        // Check for the end marker
                        if (content === '[DONE]') {
                            break;
                        }

                        try {
                            // Parse the JSON content
                            const jsonData = JSON.parse(content);

                            // Process the response text to extract thinking sections
                            const responseText = jsonData.response || '';

                            // Check for <think> tags in the response
                            const thinkStartTag = '<think>';
                            const thinkEndTag = '</think>';

                            // We need to set thinking prop to a space character initially
                            // to trigger the loading state in ThinkingMessage component
                            if (!inThinkingBlock && thinkingContent === '') {
                                thinkingContent = ' '; // Just a space to trigger loading state
                            }

                            // Find all occurrences of thinking blocks
                            const startIndex = responseText.indexOf(thinkStartTag);
                            const endIndex = responseText.indexOf(thinkEndTag);

                            // Handle partial thinking blocks in streaming
                            if (startIndex !== -1 && !inThinkingBlock) {
                                inThinkingBlock = true;
                                // Extract everything before the thinking block
                                regularContent = responseText.substring(0, startIndex);
                            }

                            if (inThinkingBlock && endIndex !== -1) {
                                // Complete thinking block found
                                thinkingContent = responseText.substring(
                                    startIndex + thinkStartTag.length,
                                    endIndex
                                );

                                // Extract content after the thinking block
                                regularContent = responseText.substring(endIndex + thinkEndTag.length);
                                inThinkingBlock = false;
                            } else if (inThinkingBlock) {
                                // We're in a thinking block, but it's not complete yet
                                thinkingContent = responseText.substring(startIndex + thinkStartTag.length);
                            } else if (startIndex === -1 && endIndex === -1) {
                                // No thinking tags in this chunk
                                regularContent = responseText;
                            }

                            // Update the assistant message with new data
                            setMessages(prevMessages =>
                                prevMessages.map(msg => {
                                    if (msg.id === assistantMessageId) {
                                        return {
                                            ...msg,
                                            content: regularContent,
                                            thinking: thinkingContent,
                                            sources: jsonData.sources || msg.sources,
                                            citations: jsonData.citations || msg.citations,
                                            suggestedTasks: jsonData.suggested_tasks || msg.suggestedTasks
                                        };
                                    }
                                    return msg;
                                })
                            );
                        } catch (error) {
                            console.error('Error parsing SSE data:', error, content);
                        }
                    }
                }
            }

            return message.id;
        } catch (error) {
            console.error('Error in chat:', error);
            setHasError(true);
            const errorMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: 'Sorry, there was an error processing your request. Please try again.',
                createdAt: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden no-scrollbar">
            <div className="flex flex-col flex-1 mx-auto w-full h-full">
                <div className="flex-1 overflow-hidden relative">
                    <div className="absolute inset-0">
                        <Messages
                            isLoading={isLoading}
                            messages={messages}
                            setMessages={setMessages}
                            reload={reload}
                            isReadonly={false}
                            isArtifactVisible={false}
                        />
                    </div>
                </div>

                <div className="bg-background z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.2)]">
                    <MultimodalInput
                        input={input}
                        setInput={setInput}
                        isLoading={isLoading}
                        stop={() => { }}
                        attachments={attachments}
                        setAttachments={setAttachments}
                        messages={messages}
                        setMessages={setMessages}
                        append={append}
                        handleSubmit={handleSubmit}
                        className="w-full"
                        detailLevel={detailLevel}
                        setDetailLevel={setDetailLevel}
                        deepResearch={deepResearch}
                        setDeepResearch={setDeepResearch}
                    />
                </div>
            </div>
        </div>
    );
}