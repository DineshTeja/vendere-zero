'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
    children: string;
    className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
    return (
        <ReactMarkdown
            className={cn(
                'prose dark:prose-invert max-w-none',
                // Paragraph styling with improved spacing and line height
                '[&>p]:my-4 [&>p]:leading-relaxed',
                '[&>p:first-child]:mt-0 [&>p:last-child]:mb-0',

                // List styling with better spacing
                '[&>ul]:my-5 [&>ul]:pl-6',
                '[&>ul>li]:mb-2 [&>ul>li]:leading-relaxed',
                '[&>ul:last-child]:mb-0',

                '[&>ol]:my-5 [&>ol]:pl-6',
                '[&>ol>li]:mb-2 [&>ol>li]:leading-relaxed',
                '[&>ol:last-child]:mb-0',

                // Blockquote styling
                '[&>blockquote]:my-6 [&>blockquote]:pl-4 [&>blockquote]:border-l-2 [&>blockquote]:border-border/60 [&>blockquote]:italic [&>blockquote]:text-muted-foreground',
                '[&>blockquote:last-child]:mb-0',

                // Heading styling with improved spacing
                '[&>h1]:text-2xl [&>h1]:font-bold [&>h1]:mt-8 [&>h1]:mb-4 [&>h1]:pb-1 [&>h1]:border-b [&>h1]:border-border/30',
                '[&>h2]:text-xl [&>h2]:font-bold [&>h2]:mt-7 [&>h2]:mb-3 [&>h2]:pt-1',
                '[&>h3]:text-lg [&>h3]:font-bold [&>h3]:mt-6 [&>h3]:mb-3',
                '[&>h4]:text-base [&>h4]:font-bold [&>h4]:mt-5 [&>h4]:mb-2',
                '[&>h5]:text-sm [&>h5]:font-bold [&>h5]:mt-4 [&>h5]:mb-2',
                '[&>h6]:text-xs [&>h6]:font-bold [&>h6]:mt-4 [&>h6]:mb-2',

                // Code block styling
                '[&>pre]:my-4 [&>pre]:p-3 [&>pre]:rounded-md [&>pre]:bg-muted/80',
                '[&>code]:px-1 [&>code]:py-0.5 [&>code]:rounded-sm [&>code]:bg-muted/60 [&>code]:text-sm',
                '[&>p>code]:px-1 [&>p>code]:py-0.5 [&>p>code]:rounded-sm [&>p>code]:bg-muted/60 [&>p>code]:text-sm',

                // Horizontal rule styling
                '[&>hr]:my-8 [&>hr]:border-border/40',

                // Table styling
                '[&>table]:w-full [&>table]:border-collapse [&>table]:my-6 [&>table]:text-sm',
                '[&>table>thead>tr]:border-b [&>table>thead>tr]:border-border/60',
                '[&>table>thead>tr>th]:p-2 [&>table>thead>tr>th]:text-left [&>table>thead>tr>th]:font-semibold',
                '[&>table>tbody>tr]:border-b [&>table>tbody>tr]:border-border/20 [&>table>tbody>tr:last-child]:border-0',
                '[&>table>tbody>tr>td]:p-2 [&>table>tbody>tr>td]:align-top',
                '[&>table>tbody>tr:nth-child(odd)]:bg-background/50',
                '[&>table>tbody>tr:hover]:bg-muted/50 [&>table>tbody>tr]:transition-colors',

                // Handle spacing between adjacent elements
                '[&>h1+p]:mt-3 [&>h2+p]:mt-2 [&>h3+p]:mt-2 [&>h4+p]:mt-2',
                '[&>h1+ul]:mt-3 [&>h2+ul]:mt-2 [&>h3+ul]:mt-2 [&>h4+ul]:mt-2',
                '[&>h1+ol]:mt-3 [&>h2+ol]:mt-2 [&>h3+ol]:mt-2 [&>h4+ol]:mt-2',

                className
            )}
            remarkPlugins={[remarkGfm]}
        >
            {children}
        </ReactMarkdown>
    );
} 