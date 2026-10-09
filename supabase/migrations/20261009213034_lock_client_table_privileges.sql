-- Version matches supabase_migrations.schema_migrations row 20261009213034.
-- Already applied to Dream AI (cxaujyagtpsxvkwkdxbc). Do not copy this file to a new timestamp.
-- Service role used by dream-api is unchanged. Client grants no longer exceed RLS.

revoke all on table public.dream_teacher_invites from anon;

revoke truncate on table
  public.dream_attachments,
  public.dream_conversation_summaries,
  public.dream_conversations,
  public.dream_integrations,
  public.dream_learning_events,
  public.dream_learning_topics,
  public.dream_messages,
  public.dream_profiles,
  public.dream_skills,
  public.dream_teacher_invites,
  public.dream_teacher_student_links,
  public.dream_test_answers,
  public.dream_test_attempts,
  public.dream_test_questions,
  public.dream_tests,
  public.dream_user_settings
from authenticated;

revoke insert, update, delete on table
  public.dream_attachments,
  public.dream_conversation_summaries,
  public.dream_integrations,
  public.dream_learning_events,
  public.dream_learning_topics,
  public.dream_messages,
  public.dream_skills,
  public.dream_teacher_invites,
  public.dream_teacher_student_links,
  public.dream_test_answers,
  public.dream_test_attempts,
  public.dream_test_questions,
  public.dream_tests
from authenticated;

revoke insert, delete on table public.dream_profiles, public.dream_user_settings from authenticated;

revoke update on table public.dream_profiles from authenticated;
grant update (
  display_name,
  avatar_url,
  academic_level,
  pref_step_by_step,
  pref_practice_suggestions,
  pref_calm_tone
) on table public.dream_profiles to authenticated;
