create table "public"."ad_variants" (
    "id" uuid not null default gen_random_uuid(),
    "image_url" text,
    "original_headlines" jsonb[],
    "new_headlines" jsonb[],
    "predicted_ctr" numeric(5,4)
);


create table "public"."feature_metrics_summary" (
    "unique_feature" text,
    "categories_ranked" text[],
    "locations_ranked" text[],
    "avg_impressions" numeric,
    "avg_clicks" numeric,
    "avg_conversions" numeric,
    "avg_ctr" numeric,
    "avg_cost" numeric,
    "avg_roas" numeric,
    "ad_structured_output_ids" uuid[],
    "library_item_ids" uuid[]
);


CREATE UNIQUE INDEX ad_variants_pkey ON public.ad_variants USING btree (id);

CREATE INDEX idx_ad_variants_image_url ON public.ad_variants USING btree (image_url);

alter table "public"."ad_variants" add constraint "ad_variants_pkey" PRIMARY KEY using index "ad_variants_pkey";

create type "public"."ad_element" as ("type" text, "location" text, "code" text, "text" text);

grant delete on table "public"."ad_variants" to "anon";

grant insert on table "public"."ad_variants" to "anon";

grant references on table "public"."ad_variants" to "anon";

grant select on table "public"."ad_variants" to "anon";

grant trigger on table "public"."ad_variants" to "anon";

grant truncate on table "public"."ad_variants" to "anon";

grant update on table "public"."ad_variants" to "anon";

grant delete on table "public"."ad_variants" to "authenticated";

grant insert on table "public"."ad_variants" to "authenticated";

grant references on table "public"."ad_variants" to "authenticated";

grant select on table "public"."ad_variants" to "authenticated";

grant trigger on table "public"."ad_variants" to "authenticated";

grant truncate on table "public"."ad_variants" to "authenticated";

grant update on table "public"."ad_variants" to "authenticated";

grant delete on table "public"."ad_variants" to "service_role";

grant insert on table "public"."ad_variants" to "service_role";

grant references on table "public"."ad_variants" to "service_role";

grant select on table "public"."ad_variants" to "service_role";

grant trigger on table "public"."ad_variants" to "service_role";

grant truncate on table "public"."ad_variants" to "service_role";

grant update on table "public"."ad_variants" to "service_role";

grant delete on table "public"."feature_metrics_summary" to "anon";

grant insert on table "public"."feature_metrics_summary" to "anon";

grant references on table "public"."feature_metrics_summary" to "anon";

grant select on table "public"."feature_metrics_summary" to "anon";

grant trigger on table "public"."feature_metrics_summary" to "anon";

grant truncate on table "public"."feature_metrics_summary" to "anon";

grant update on table "public"."feature_metrics_summary" to "anon";

grant delete on table "public"."feature_metrics_summary" to "authenticated";

grant insert on table "public"."feature_metrics_summary" to "authenticated";

grant references on table "public"."feature_metrics_summary" to "authenticated";

grant select on table "public"."feature_metrics_summary" to "authenticated";

grant trigger on table "public"."feature_metrics_summary" to "authenticated";

grant truncate on table "public"."feature_metrics_summary" to "authenticated";

grant update on table "public"."feature_metrics_summary" to "authenticated";

grant delete on table "public"."feature_metrics_summary" to "service_role";

grant insert on table "public"."feature_metrics_summary" to "service_role";

grant references on table "public"."feature_metrics_summary" to "service_role";

grant select on table "public"."feature_metrics_summary" to "service_role";

grant trigger on table "public"."feature_metrics_summary" to "service_role";

grant truncate on table "public"."feature_metrics_summary" to "service_role";

grant update on table "public"."feature_metrics_summary" to "service_role";


