create table "public"."custom_rules" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "type" text not null,
    "name" text not null,
    "description" text not null,
    "value" jsonb not null,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
);


create table "public"."headline_variants" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "image_url" text not null,
    "rules_used" jsonb not null default '[]'::jsonb,
    "original_headlines" jsonb not null default '[]'::jsonb,
    "new_headlines" jsonb not null default '[]'::jsonb,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
);


create table "public"."materials" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "material_url" text not null,
    "content_type" text,
    "summary" text not null,
    "analysis" text not null,
    "content_rules" jsonb not null default '[]'::jsonb,
    "material_type" text,
    "tags" text[],
    "image_urls" text[],
    "crawled_urls" jsonb not null default '[]'::jsonb,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
);


CREATE UNIQUE INDEX custom_rules_pkey ON public.custom_rules USING btree (id);

CREATE UNIQUE INDEX headline_variants_pkey ON public.headline_variants USING btree (id);

CREATE UNIQUE INDEX materials_pkey ON public.materials USING btree (id);

CREATE UNIQUE INDEX materials_user_id_material_url_key ON public.materials USING btree (user_id, material_url);

alter table "public"."custom_rules" add constraint "custom_rules_pkey" PRIMARY KEY using index "custom_rules_pkey";

alter table "public"."headline_variants" add constraint "headline_variants_pkey" PRIMARY KEY using index "headline_variants_pkey";

alter table "public"."materials" add constraint "materials_pkey" PRIMARY KEY using index "materials_pkey";

alter table "public"."custom_rules" add constraint "fk_user" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."custom_rules" validate constraint "fk_user";

alter table "public"."headline_variants" add constraint "fk_user" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."headline_variants" validate constraint "fk_user";

alter table "public"."materials" add constraint "fk_user" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."materials" validate constraint "fk_user";

alter table "public"."materials" add constraint "materials_content_type_check" CHECK ((content_type = ANY (ARRAY['pdf'::text, 'docx'::text, 'url'::text, 'gdrive'::text, 'notion'::text]))) not valid;

alter table "public"."materials" validate constraint "materials_content_type_check";

alter table "public"."materials" add constraint "materials_user_id_material_url_key" UNIQUE using index "materials_user_id_material_url_key";

create or replace view "public"."enhanced_ad_metrics_by_campaign" as  SELECT e.campaign_id,
    sum(e.impressions) AS total_impressions,
    sum(e.clicks) AS total_clicks,
        CASE
            WHEN (sum(e.impressions) > 0) THEN ((sum(e.clicks))::real / (sum(e.impressions))::double precision)
            ELSE (0)::double precision
        END AS avg_ctr,
    sum(e.conversions) AS total_conversions,
        CASE
            WHEN (sum(e.clicks) > 0) THEN ((sum(e.conversions))::real / (sum(e.clicks))::double precision)
            ELSE (0)::double precision
        END AS avg_conversion_rate,
    sum(e.cost) AS total_cost,
        CASE
            WHEN (sum(e.conversions) > 0) THEN (sum(e.cost) / (sum(e.conversions))::double precision)
            ELSE (0)::double precision
        END AS cost_per_conversion,
        CASE
            WHEN (sum(e.cost) > (0)::double precision) THEN (sum((e.roas * e.cost)) / sum(e.cost))
            ELSE (0)::real
        END AS avg_roas,
    e.ad_id,
    li.item_id AS library_item_id,
    aso.image_url,
    aso.image_description
   FROM ((enhanced_ad_metrics e
     JOIN library_items li ON ((e.ad_id = li.id)))
     JOIN ad_structured_output aso ON ((li.item_id = aso.id)))
  GROUP BY e.campaign_id, e.ad_id, li.item_id, aso.image_url, aso.image_description
  ORDER BY (sum(e.impressions)) DESC;


grant delete on table "public"."custom_rules" to "anon";

grant insert on table "public"."custom_rules" to "anon";

grant references on table "public"."custom_rules" to "anon";

grant select on table "public"."custom_rules" to "anon";

grant trigger on table "public"."custom_rules" to "anon";

grant truncate on table "public"."custom_rules" to "anon";

grant update on table "public"."custom_rules" to "anon";

grant delete on table "public"."custom_rules" to "authenticated";

grant insert on table "public"."custom_rules" to "authenticated";

grant references on table "public"."custom_rules" to "authenticated";

grant select on table "public"."custom_rules" to "authenticated";

grant trigger on table "public"."custom_rules" to "authenticated";

grant truncate on table "public"."custom_rules" to "authenticated";

grant update on table "public"."custom_rules" to "authenticated";

grant delete on table "public"."custom_rules" to "service_role";

grant insert on table "public"."custom_rules" to "service_role";

grant references on table "public"."custom_rules" to "service_role";

grant select on table "public"."custom_rules" to "service_role";

grant trigger on table "public"."custom_rules" to "service_role";

grant truncate on table "public"."custom_rules" to "service_role";

grant update on table "public"."custom_rules" to "service_role";

grant delete on table "public"."headline_variants" to "anon";

grant insert on table "public"."headline_variants" to "anon";

grant references on table "public"."headline_variants" to "anon";

grant select on table "public"."headline_variants" to "anon";

grant trigger on table "public"."headline_variants" to "anon";

grant truncate on table "public"."headline_variants" to "anon";

grant update on table "public"."headline_variants" to "anon";

grant delete on table "public"."headline_variants" to "authenticated";

grant insert on table "public"."headline_variants" to "authenticated";

grant references on table "public"."headline_variants" to "authenticated";

grant select on table "public"."headline_variants" to "authenticated";

grant trigger on table "public"."headline_variants" to "authenticated";

grant truncate on table "public"."headline_variants" to "authenticated";

grant update on table "public"."headline_variants" to "authenticated";

grant delete on table "public"."headline_variants" to "service_role";

grant insert on table "public"."headline_variants" to "service_role";

grant references on table "public"."headline_variants" to "service_role";

grant select on table "public"."headline_variants" to "service_role";

grant trigger on table "public"."headline_variants" to "service_role";

grant truncate on table "public"."headline_variants" to "service_role";

grant update on table "public"."headline_variants" to "service_role";

grant delete on table "public"."materials" to "anon";

grant insert on table "public"."materials" to "anon";

grant references on table "public"."materials" to "anon";

grant select on table "public"."materials" to "anon";

grant trigger on table "public"."materials" to "anon";

grant truncate on table "public"."materials" to "anon";

grant update on table "public"."materials" to "anon";

grant delete on table "public"."materials" to "authenticated";

grant insert on table "public"."materials" to "authenticated";

grant references on table "public"."materials" to "authenticated";

grant select on table "public"."materials" to "authenticated";

grant trigger on table "public"."materials" to "authenticated";

grant truncate on table "public"."materials" to "authenticated";

grant update on table "public"."materials" to "authenticated";

grant delete on table "public"."materials" to "service_role";

grant insert on table "public"."materials" to "service_role";

grant references on table "public"."materials" to "service_role";

grant select on table "public"."materials" to "service_role";

grant trigger on table "public"."materials" to "service_role";

grant truncate on table "public"."materials" to "service_role";

grant update on table "public"."materials" to "service_role";


