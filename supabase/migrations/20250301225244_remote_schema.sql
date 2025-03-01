create type "public"."task_status" as enum ('pending', 'processing', 'completed', 'failed');

create table "public"."enhanced_ad_metrics" (
    "id" uuid not null default uuid_generate_v4(),
    "ad_id" uuid not null,
    "campaign_id" text,
    "channel" text not null,
    "impressions" integer not null default 0,
    "clicks" integer not null default 0,
    "ctr" real not null default 0,
    "conversions" integer not null default 0,
    "conversion_rate" real not null default 0,
    "cost" real not null default 0,
    "cpc" real not null default 0,
    "cpm" real not null default 0,
    "roas" real not null default 0,
    "viewable_impressions" integer not null default 0,
    "viewability_rate" real not null default 0,
    "demographics" jsonb,
    "device_metrics" jsonb,
    "engagement" jsonb,
    "placement" jsonb,
    "date" date not null,
    "quality_score" real not null default 0,
    "created_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone default CURRENT_TIMESTAMP
);


create table "public"."tasks" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "type" character varying(50) not null,
    "status" task_status not null default 'pending'::task_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "meta" jsonb,
    "result" jsonb,
    "error" text
);


alter table "public"."ad_structured_output" disable row level security;

CREATE INDEX enhanced_ad_metrics_ad_id_idx ON public.enhanced_ad_metrics USING btree (ad_id);

CREATE UNIQUE INDEX enhanced_ad_metrics_ad_id_key ON public.enhanced_ad_metrics USING btree (ad_id);

CREATE INDEX enhanced_ad_metrics_campaign_id_idx ON public.enhanced_ad_metrics USING btree (campaign_id);

CREATE INDEX enhanced_ad_metrics_channel_idx ON public.enhanced_ad_metrics USING btree (channel);

CREATE INDEX enhanced_ad_metrics_date_idx ON public.enhanced_ad_metrics USING btree (date);

CREATE UNIQUE INDEX enhanced_ad_metrics_pkey ON public.enhanced_ad_metrics USING btree (id);

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);

CREATE INDEX idx_tasks_type ON public.tasks USING btree (type);

CREATE INDEX idx_tasks_user_id ON public.tasks USING btree (user_id);

CREATE UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id);

alter table "public"."enhanced_ad_metrics" add constraint "enhanced_ad_metrics_pkey" PRIMARY KEY using index "enhanced_ad_metrics_pkey";

alter table "public"."tasks" add constraint "tasks_pkey" PRIMARY KEY using index "tasks_pkey";

alter table "public"."enhanced_ad_metrics" add constraint "enhanced_ad_metrics_ad_id_key" UNIQUE using index "enhanced_ad_metrics_ad_id_key";

alter table "public"."tasks" add constraint "tasks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."tasks" validate constraint "tasks_user_id_fkey";

set check_function_bodies = off;

create or replace view "public"."enhanced_ad_metrics_by_campaign" as  SELECT enhanced_ad_metrics.campaign_id,
    sum(enhanced_ad_metrics.impressions) AS total_impressions,
    sum(enhanced_ad_metrics.clicks) AS total_clicks,
        CASE
            WHEN (sum(enhanced_ad_metrics.impressions) > 0) THEN ((sum(enhanced_ad_metrics.clicks))::real / (sum(enhanced_ad_metrics.impressions))::double precision)
            ELSE (0)::double precision
        END AS avg_ctr,
    sum(enhanced_ad_metrics.conversions) AS total_conversions,
        CASE
            WHEN (sum(enhanced_ad_metrics.clicks) > 0) THEN ((sum(enhanced_ad_metrics.conversions))::real / (sum(enhanced_ad_metrics.clicks))::double precision)
            ELSE (0)::double precision
        END AS avg_conversion_rate,
    sum(enhanced_ad_metrics.cost) AS total_cost,
        CASE
            WHEN (sum(enhanced_ad_metrics.conversions) > 0) THEN (sum(enhanced_ad_metrics.cost) / (sum(enhanced_ad_metrics.conversions))::double precision)
            ELSE (0)::double precision
        END AS cost_per_conversion,
        CASE
            WHEN (sum(enhanced_ad_metrics.cost) > (0)::double precision) THEN (sum((enhanced_ad_metrics.roas * enhanced_ad_metrics.cost)) / sum(enhanced_ad_metrics.cost))
            ELSE (0)::real
        END AS avg_roas
   FROM enhanced_ad_metrics
  GROUP BY enhanced_ad_metrics.campaign_id
  ORDER BY (sum(enhanced_ad_metrics.impressions)) DESC;


create or replace view "public"."enhanced_ad_metrics_by_channel" as  SELECT enhanced_ad_metrics.channel,
    enhanced_ad_metrics.date,
    sum(enhanced_ad_metrics.impressions) AS total_impressions,
    sum(enhanced_ad_metrics.clicks) AS total_clicks,
        CASE
            WHEN (sum(enhanced_ad_metrics.impressions) > 0) THEN ((sum(enhanced_ad_metrics.clicks))::real / (sum(enhanced_ad_metrics.impressions))::double precision)
            ELSE (0)::double precision
        END AS avg_ctr,
    sum(enhanced_ad_metrics.conversions) AS total_conversions,
        CASE
            WHEN (sum(enhanced_ad_metrics.clicks) > 0) THEN ((sum(enhanced_ad_metrics.conversions))::real / (sum(enhanced_ad_metrics.clicks))::double precision)
            ELSE (0)::double precision
        END AS avg_conversion_rate,
    sum(enhanced_ad_metrics.cost) AS total_cost,
        CASE
            WHEN (sum(enhanced_ad_metrics.clicks) > 0) THEN (sum(enhanced_ad_metrics.cost) / (sum(enhanced_ad_metrics.clicks))::double precision)
            ELSE (0)::double precision
        END AS avg_cpc,
        CASE
            WHEN (sum(enhanced_ad_metrics.impressions) > 0) THEN ((sum(enhanced_ad_metrics.cost) / (sum(enhanced_ad_metrics.impressions))::double precision) * (1000)::double precision)
            ELSE (0)::double precision
        END AS avg_cpm
   FROM enhanced_ad_metrics
  GROUP BY enhanced_ad_metrics.channel, enhanced_ad_metrics.date
  ORDER BY enhanced_ad_metrics.date DESC, (sum(enhanced_ad_metrics.impressions)) DESC;


CREATE OR REPLACE FUNCTION public.update_enhanced_ad_metrics_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."enhanced_ad_metrics" to "anon";

grant insert on table "public"."enhanced_ad_metrics" to "anon";

grant references on table "public"."enhanced_ad_metrics" to "anon";

grant select on table "public"."enhanced_ad_metrics" to "anon";

grant trigger on table "public"."enhanced_ad_metrics" to "anon";

grant truncate on table "public"."enhanced_ad_metrics" to "anon";

grant update on table "public"."enhanced_ad_metrics" to "anon";

grant delete on table "public"."enhanced_ad_metrics" to "authenticated";

grant insert on table "public"."enhanced_ad_metrics" to "authenticated";

grant references on table "public"."enhanced_ad_metrics" to "authenticated";

grant select on table "public"."enhanced_ad_metrics" to "authenticated";

grant trigger on table "public"."enhanced_ad_metrics" to "authenticated";

grant truncate on table "public"."enhanced_ad_metrics" to "authenticated";

grant update on table "public"."enhanced_ad_metrics" to "authenticated";

grant delete on table "public"."enhanced_ad_metrics" to "service_role";

grant insert on table "public"."enhanced_ad_metrics" to "service_role";

grant references on table "public"."enhanced_ad_metrics" to "service_role";

grant select on table "public"."enhanced_ad_metrics" to "service_role";

grant trigger on table "public"."enhanced_ad_metrics" to "service_role";

grant truncate on table "public"."enhanced_ad_metrics" to "service_role";

grant update on table "public"."enhanced_ad_metrics" to "service_role";

grant delete on table "public"."tasks" to "anon";

grant insert on table "public"."tasks" to "anon";

grant references on table "public"."tasks" to "anon";

grant select on table "public"."tasks" to "anon";

grant trigger on table "public"."tasks" to "anon";

grant truncate on table "public"."tasks" to "anon";

grant update on table "public"."tasks" to "anon";

grant delete on table "public"."tasks" to "authenticated";

grant insert on table "public"."tasks" to "authenticated";

grant references on table "public"."tasks" to "authenticated";

grant select on table "public"."tasks" to "authenticated";

grant trigger on table "public"."tasks" to "authenticated";

grant truncate on table "public"."tasks" to "authenticated";

grant update on table "public"."tasks" to "authenticated";

grant delete on table "public"."tasks" to "service_role";

grant insert on table "public"."tasks" to "service_role";

grant references on table "public"."tasks" to "service_role";

grant select on table "public"."tasks" to "service_role";

grant trigger on table "public"."tasks" to "service_role";

grant truncate on table "public"."tasks" to "service_role";

grant update on table "public"."tasks" to "service_role";

CREATE TRIGGER enhanced_ad_metrics_updated_at BEFORE UPDATE ON public.enhanced_ad_metrics FOR EACH ROW EXECUTE FUNCTION update_enhanced_ad_metrics_updated_at();


