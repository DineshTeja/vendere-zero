import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Helper for caching API responses to reduce database load
const API_CACHE = new Map();
const CACHE_TTL = 30000; // 30 seconds cache

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '10');
        const start = (page - 1) * pageSize;
        const end = start + pageSize - 1;

        // Create cache key based on request parameters
        const cacheKey = `library_${page}_${pageSize}`;
        
        // Check if we have a valid cached response
        const cachedData = API_CACHE.get(cacheKey);
        if (cachedData && cachedData.timestamp > Date.now() - CACHE_TTL) {
            return NextResponse.json(cachedData.data);
        }

        const supabase = createServerSupabaseClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Use parallel requests for count and data
        const [countResult, dataResult] = await Promise.all([
            supabase
                .from('library_items')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id),
            
            supabase
                .from('library_items')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .range(start, end)
        ]);

        if (countResult.error) {
            console.error("Count error:", countResult.error);
            return NextResponse.json({ error: "Error counting items" }, { status: 500 });
        }

        if (dataResult.error) {
            console.error("Data error:", dataResult.error);
            return NextResponse.json({ error: "Error fetching library items" }, { status: 500 });
        }

        const transformedItems = dataResult.data.map(item => ({
            id: item.id,
            type: item.type,
            name: item.name,
            image_url: item.preview_url,
            video: item.type === 'video' ? {
                id: item.item_id,
                name: item.name,
                description: item.description,
            } : undefined,
            image_description: item.description || 'No description',
            features: item.features || [],
            sentiment_analysis: {
                tones: item.sentiment_tones || [],
                confidence: item.avg_sentiment_confidence || 0
            },
            created_at: item.created_at ?? (() => {
                const daysAgo = Math.floor(Math.random() * (15 - 10 + 1)) + 10;
                const date = new Date();
                date.setDate(date.getDate() - daysAgo);
                return date.toISOString();
            })()
        }));

        // Create response data
        const responseData = {
            items: transformedItems,
            total: countResult.count,
            page,
            pageSize,
            totalPages: Math.ceil((countResult.count || 0) / pageSize)
        };

        // Cache the response
        API_CACHE.set(cacheKey, {
            data: responseData,
            timestamp: Date.now()
        });

        return NextResponse.json(responseData);
    } catch (error) {
        console.error("Error fetching library data:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}