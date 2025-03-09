import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { ad_features, keywords, user_id, image_url, task_id } = body;

        // Validate required fields
        if (!ad_features || !keywords || !user_id || !image_url || !task_id) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        // Update task status to processing
        await supabase
            .from("tasks")
            .update({ status: "processing" })
            .eq("id", task_id);

        // Call the batch generation API
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ||
            "http://localhost:8000";

        // Ensure ad_features contains all required fields
        const enhancedAdFeatures = {
            ...ad_features,
            image_url: image_url, // Ensure image_url is included in ad_features
            product_category: ad_features.product_category || "product",
        };

        const response = await fetch(
            `${apiUrl}/keywords/batch-generate`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ad_features: enhancedAdFeatures,
                    keywords,
                    user_id,
                    image_url, // Include image_url at top level as well
                }),
            },
        );

        if (!response.ok) {
            const errorData = await response.json();

            // Update task with error
            await supabase
                .from("tasks")
                .update({
                    status: "failed",
                    error: errorData.detail || "Failed to generate variants",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", task_id);

            return NextResponse.json(
                { error: errorData.detail || "Failed to generate variants" },
                { status: response.status },
            );
        }

        const data = await response.json();

        // Update task with results
        await supabase
            .from("tasks")
            .update({
                status: "completed",
                result: data,
                updated_at: new Date().toISOString(),
            })
            .eq("id", task_id);

        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in batch-generate:", error);

        // If we have a task_id, update it with the error
        if (error instanceof Error) {
            try {
                const body = await request.json();
                if (body.task_id) {
                    await supabase
                        .from("tasks")
                        .update({
                            status: "failed",
                            error: error.message,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", body.task_id);
                }
            } catch (e) {
                console.error("Error updating task:", e);
            }
        }

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get("taskId");

        if (!taskId) {
            return NextResponse.json(
                { error: "Task ID is required" },
                { status: 400 },
            );
        }

        // Get task from Supabase
        const { data: task, error } = await supabase
            .from("tasks")
            .select("*")
            .eq("id", taskId)
            .single();

        if (error) {
            return NextResponse.json(
                { error: "Task not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({
            status: task.status,
            result: task.result,
            error: task.error,
        });
    } catch (error) {
        console.error("Error in batch-generate GET:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
