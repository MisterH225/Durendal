-- 039_intel_projection_question_summary.sql
-- Read model: question + dernier lien intel_event + dernier changement de probabilité causal.

create or replace view projection_intel_question_summary as
select
  fq.id                    as question_id,
  fq.slug                  as question_slug,
  fq.title                 as question_title,
  fq.status                as question_status,
  fq.close_date            as close_date,
  fq.blended_probability,
  fq.ai_probability,
  fq.crowd_probability,
  fq.forecast_count,
  fq.updated_at            as question_updated_at,

  qel.intel_event_id,
  qel.weight               as intel_link_weight,
  qel.created_at as intel_link_created_at,

  ie.slug                  as intel_event_slug,
  ie.title                 as intel_event_title,
  ie.status                as intel_event_status,
  ie.severity              as intel_event_severity,

  pcl.id                   as last_probability_change_id,
  pcl.recalculation_request_id as last_recalculation_request_id,
  pcl.context_snapshot_id as last_context_snapshot_id,
  pcl.trigger_signal_ids   as last_trigger_signal_ids,
  pcl.ai_prev              as last_ai_prev,
  pcl.ai_new               as last_ai_new,
  pcl.crowd_prev           as last_crowd_prev,
  pcl.crowd_new            as last_crowd_new,
  pcl.blended_prev         as last_blended_prev,
  pcl.blended_new          as last_blended_new,
  pcl.change_reason        as last_change_reason,
  pcl.blend_formula_version as last_blend_formula_version,
  pcl.created_at           as last_probability_change_at

from forecast_questions fq
left join lateral (
  select l.intel_event_id, l.weight, l.created_at
  from intel_question_event_links l
  where l.question_id = fq.id
  order by l.created_at desc
  limit 1
) qel on true
left join intel_events ie on ie.id = qel.intel_event_id
left join lateral (
  select c.*
  from intel_probability_change_log c
  where c.question_id = fq.id
  order by c.created_at desc
  limit 1
) pcl on true;

comment on view projection_intel_question_summary is 'Projection UI: question forecast + dernier lien intel_event + dernier log causal probabilité.';
