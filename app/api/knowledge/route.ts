import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    if (!body.query && body.messages?.length > 0) {
      const lastUserMessage = [...body.messages].reverse().find(msg => msg.role === 'user');
      if (lastUserMessage) {
        body.query = lastUserMessage.content;
      }
    }
    
    if (!body.query) {
      throw new Error('Missing required parameter: query');
    }

    // Check if streaming is requested
    const shouldStream = body.stream === true;

    // Ensure detail level is a number between 0-100, defaulting to 50 if not provided
    const detailLevel = typeof body.detailLevel === 'number' 
      ? Math.max(0, Math.min(100, body.detailLevel)) 
      : 50;
    
    // Add detailLevel to the request body
    const requestBody = {
      query: body.query,
      detailLevel,
      deep_research: body.deepResearch || false,
    };

    if (shouldStream) {
      // Call the streaming endpoint
      const response = await fetch(process.env.NEXT_PUBLIC_API_URL + '/knowledge/query/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Just pass through the response stream directly
      // No need for transformation since we're handling the JSON parsing in the client
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    // Non-streaming path (existing code)
    const response = await fetch(process.env.NEXT_PUBLIC_API_URL + '/knowledge/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    const formattedResponse = {
      id: Date.now().toString(),
      role: 'assistant' as const,
      content: data.response,
      sources: data.sources,
      citations: data.citations || [],
      suggestedTasks: data.suggested_tasks || [],
      createdAt: new Date()
    };
    
    return NextResponse.json(formattedResponse);
  } catch (error) {
    console.error('Error in knowledge query:', error);
    return NextResponse.json(
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
        createdAt: new Date()
      },
      { status: 500 }
    );
  }
} 